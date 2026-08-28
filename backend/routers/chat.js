const express = require('express');
const router = express.Router();
const { ChatPromptTemplate, MessagesPlaceholder } = require("@langchain/core/prompts");
const { createToolCallingAgent, AgentExecutor } = require("langchain/agents");
const { ChatGroq } = require("@langchain/groq");
const { SystemMessage, HumanMessage, AIMessage } = require("@langchain/core/messages");
const { optionalVerifyToken } = require('../routers/auth');
const { vectorStore } = require('../state');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { v4: uuidv4 } = require('uuid');
const { analyzeCsv } = require('../utils/chartUtils');
const { generateChartTool } = require('../tools/GenerateChartTool');
const { EDA_PROMPT } = require('../prompts/eda');
const { REASONING_INSTRUCTION, DEFAULT_SYSTEM_PROMPT } = require('../prompts/system');
require('dotenv').config();

// Helper functions using Mongoose
async function saveMsg(userId, conversationId, userPrompt, llmResponse, source, sources, chartData) {
    try {
        const msg = new Message({
            conversation_id: conversationId,
            user_prompt: userPrompt,
            web_context: "",
            llm_response: llmResponse,
            source: source,
            sources: JSON.stringify(sources), // Keeping format consistent
            chart: JSON.stringify(chartData), // Save chart config
            timestamp: new Date()
        });
        await msg.save();
        return msg;
    } catch (e) {
        console.error("Log error", e);
    }
}
async function createChat(userId, title) {
    try {
        const convId = uuidv4();
        const conversation = new Conversation({
            id: convId,
            user_id: userId,
            title: title
        });
        await conversation.save();
        return convId;
    } catch (e) {
        console.error("Create conv error", e);
        return null;
    }
}

async function getHistory(conversationId) {
    try {
        const msgs = await Message.find({ conversation_id: conversationId })
            .sort({ timestamp: -1 }) // Newest first
            .limit(10);

        const messages = [];
        // Reverse to get chronological order for LLM
        for (let i = msgs.length - 1; i >= 0; i--) {
            const row = msgs[i];
            messages.push(new HumanMessage(row.user_prompt));
            messages.push(new AIMessage(row.llm_response));
        }
        return messages;
    } catch (e) {
        console.error("Get history error", e);
        return [];
    }
}
router.post('/', optionalVerifyToken, async (req, res) => {
    let conversation_id = null;
    try {
        const currentUser = req.user;
        let userId = currentUser ? currentUser.sub : null;
        if (!userId) {
            const guestId = req.headers['x-guest-id'];
            if (guestId) userId = `guest_${guestId}`;
            else return res.status(401).json({ detail: "Authentication required" });
        }

        let context = "";
        let sources = [];
        let strategy = "direct";
        let chartData = null;
        let responseText = "";

        let { message, model, system_prompt, file_path } = req.body;
        conversation_id = req.body.conversation_id;

        if (!conversation_id) {
            const title = message.substring(0, 30) + "...";
            conversation_id = await createChat(userId, title);
        }

        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) return res.status(500).json({ detail: "GROQ_API_KEY not configured" });

        const llm = new ChatGroq({
            apiKey: apiKey,
            model: model || "llama3-70b-8192",
            temperature: 0.1 // Lower temp for analytic agent
        });

        // ---------------------------------------------------------
        // STRATEGY 1: EDA AGENT (If File Uploaded)
        // ---------------------------------------------------------
        const FileModel = require('../models/FileModel');
        const fs = require('fs');
        const os = require('os');
        const path = require('path');

        // ...

        if (file_path && file_path.toLowerCase().endsWith('.csv')) {
            try {
                // RESTORE FILE IF FROM DB (Vercel Fix)
                if (file_path.startsWith('db://')) {
                    const fileId = file_path.replace('db://', '');
                    const fileDoc = await FileModel.findById(fileId);

                    if (!fileDoc) {
                        throw new Error("File expired or not found. Please upload again.");
                    }

                    // Write to local temp
                    const tempDir = os.tmpdir();
                    const restoredPath = path.join(tempDir, `${fileId}-${fileDoc.filename}`);
                    fs.writeFileSync(restoredPath, fileDoc.content);
                    file_path = restoredPath; // Update for analysis tools
                }

                // 1. Analyze File
                const fileStats = await analyzeCsv(file_path);

                // OPTIMIZATION: Create simplified metadata to save tokens
                const simplifiedMetadata = {};
                for (const [col, meta] of Object.entries(fileStats.columnMetadata)) {
                    simplifiedMetadata[col] = { type: meta.type };
                    if (meta.type === 'number') {
                        simplifiedMetadata[col].min = meta.min;
                        simplifiedMetadata[col].max = meta.max;
                    }
                }

                const limitedPreview = (fileStats.preview || []).slice(0, 2);
                const previewStr = JSON.stringify(limitedPreview);

                // 2. Prepare System Prompt (Inject Context)
                let filledSystemPrompt = EDA_PROMPT
                    .replace('{file_stats}', JSON.stringify({ rowCount: fileStats.rowCount, columns: simplifiedMetadata }, null, 2))
                    .replace('{column_preview}', previewStr)
                    .replace('{user_query}', message) // We keep it in system prompt for context, but also pass as input
                    + `\n\nActive File Path: ${file_path}`; // Explicitly tell agent the path

                // ESCAPE BRACES for LangChain Template
                // LangChain treats { and } as variable delimiters. We must escape them as {{ and }}
                // since our prompt contains JSON examples and JSON content.
                const escapedSystemPrompt = filledSystemPrompt.replace(/{/g, "{{").replace(/}/g, "}}");

                // 3. Setup Logic
                const tools = [generateChartTool];

                const promptTemplate = ChatPromptTemplate.fromMessages([
                    ["system", escapedSystemPrompt],
                    new MessagesPlaceholder("chat_history"),
                    ["human", "{input}"],
                    new MessagesPlaceholder("agent_scratchpad"),
                ]);

                const agent = await createToolCallingAgent({
                    llm,
                    tools,
                    prompt: promptTemplate,
                });

                const agentExecutor = new AgentExecutor({
                    agent,
                    tools,
                    verbose: true,
                    returnIntermediateSteps: true,
                });

                const history = await getHistory(conversation_id);

                // 4. Execute Agent with Timeout (9s for Vercel Hobby Limit)
                const result = await Promise.race([
                    agentExecutor.invoke({
                        input: message,
                        chat_history: history
                    }),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error("Analysis timed out. Please try a simpler request.")), 9000)
                    )
                ]);

                responseText = result.output;
                strategy = "eda_agent";

                // 5. Extract Chart Data from Steps
                if (result.intermediateSteps && result.intermediateSteps.length > 0) {
                    const charts = [];
                    for (const step of result.intermediateSteps) {
                        try {
                            // step.action is the tool call, step.observation is the result
                            if (step.action.tool === "generate_chart") {
                                const obs = JSON.parse(step.observation);
                                if (!obs.error) {
                                    charts.push(obs);
                                }
                            }
                        } catch (e) {
                            console.error("Error parsing intermediate step chart:", e);
                        }
                    }
                    if (charts.length > 0) chartData = charts;
                }

            } catch (err) {
                console.error("EDA Agent Error", err);
                responseText = `Failed to analyze data: ${err.message}`;
            }

        } else {
            // ---------------------------------------------------------
            // STRATEGY 2: VECTOR SEARCH / GENERAL CHAT
            // ---------------------------------------------------------
            try {
                const docs = await vectorStore.similaritySearch(message, 2);
                if (docs && docs.length > 0) {
                    const contextText = docs.map(d => d.pageContent).join("\n\n");
                    context = `Context from uploaded documents:\n${contextText}`;
                    sources = [{ title: "Document Context", url: "#" }];
                    strategy = "vector";
                }
            } catch (e) { }

            const baseSystem = system_prompt || DEFAULT_SYSTEM_PROMPT;
            const fullSystemPrompt = `${baseSystem}\n\n[INSTRUCTIONS]: ${REASONING_INSTRUCTION}\n\n${context}`;
            const history = await getHistory(conversation_id);

            const messages = [
                new SystemMessage(fullSystemPrompt),
                ...history,
                new HumanMessage(message)
            ];

            const responseResult = await llm.invoke(messages);
            responseText = responseResult.content;
            // No chart generation for generic chat (as per user request)
        }

        // Save & Respond
        await saveMsg(userId, conversation_id, message, responseText, strategy, sources, chartData);

        res.json({
            response: responseText,
            conversation_id: conversation_id,
            sources: sources,
            strategy: strategy,
            chart: chartData
        });

    } catch (e) {
        console.error("Chat error", e);
        res.status(500).json({ detail: e.message, stack: e.stack, conversation_id });
    }
});

router.get('/history', optionalVerifyToken, async (req, res) => {
    try {
        const currentUser = req.user;
        let userId = currentUser ? currentUser.sub : null;
        if (!userId && req.headers['x-guest-id']) userId = `guest_${req.headers['x-guest-id']}`;
        if (!userId) return res.status(401).json({ detail: "Auth required" });

        const convs = await Conversation.find({ user_id: userId })
            .sort({ is_pinned: -1, created_at: -1 });
        res.json(convs);
    } catch (e) {
        console.error("Get history list error", e);
        res.status(500).json({ detail: e.message });
    }
});

router.put('/conversations/:conversation_id', optionalVerifyToken, async (req, res) => {
    const currentUser = req.user;
    let userId = currentUser ? currentUser.sub : null;
    if (!userId && req.headers['x-guest-id']) userId = `guest_${req.headers['x-guest-id']}`;
    if (!userId) return res.status(401).json({ detail: "Auth required" });

    const { conversation_id } = req.params;
    const { title, is_pinned } = req.body;

    try {
        const conv = await Conversation.findOne({ id: conversation_id });
        if (!conv || conv.user_id !== userId) {
            return res.status(403).json({ detail: "Not authorized" });
        }

        if (title !== undefined) conv.title = title;
        if (is_pinned !== undefined) conv.is_pinned = is_pinned;

        await conv.save();
        res.json({ message: "Conversation updated" });
    } catch (e) {
        console.error("Update conversation error", e);
        res.status(500).json({ detail: e.message });
    }
});

router.delete('/conversations/:conversation_id', optionalVerifyToken, async (req, res) => {
    const currentUser = req.user;
    let userId = currentUser ? currentUser.sub : null;
    if (!userId && req.headers['x-guest-id']) userId = `guest_${req.headers['x-guest-id']}`;
    if (!userId) return res.status(401).json({ detail: "Auth required" });

    const { conversation_id } = req.params;

    try {
        const conv = await Conversation.findOne({ id: conversation_id });
        if (!conv || conv.user_id !== userId) {
            return res.status(403).json({ detail: "Not authorized" });
        }

        await Message.deleteMany({ conversation_id: conversation_id });
        await Conversation.deleteOne({ id: conversation_id });

        res.json({ message: "Conversation deleted" });
    } catch (e) {
        console.error("Delete conversation error", e);
        res.status(500).json({ detail: e.message });
    }
});

router.get('/history/:conversation_id', optionalVerifyToken, async (req, res) => {
    const currentUser = req.user;
    let userId = currentUser ? currentUser.sub : null;
    if (!userId && req.headers['x-guest-id']) userId = `guest_${req.headers['x-guest-id']}`;
    if (!userId) return res.status(401).json({ detail: "Auth required" });

    const { conversation_id } = req.params;

    try {
        const conv = await Conversation.findOne({ id: conversation_id });
        if (!conv || conv.user_id !== userId) {
            return res.status(403).json({ detail: "Not authorized" });
        }

        const rows = await Message.find({ conversation_id: conversation_id }).sort({ timestamp: 1 });

        const formattedMessages = [];
        rows.forEach(row => {
            formattedMessages.push({
                role: "user",
                content: row.user_prompt
            });

            let sourcesList = [];
            try {
                if (row.sources) sourcesList = JSON.parse(row.sources);
            } catch (e) { }

            let chartConfig = null;
            try {
                if (row.chart) chartConfig = JSON.parse(row.chart);
            } catch (e) {
                console.error("Error parsing chart config", e);
            }

            formattedMessages.push({
                role: "assistant",
                content: row.llm_response,
                sources: sourcesList,
                chart: chartConfig
            });
        });
        res.json(formattedMessages);
    } catch (e) {
        console.error("Get conversation details error", e);
        res.status(500).json({ detail: e.message });
    }
});

module.exports = router;
