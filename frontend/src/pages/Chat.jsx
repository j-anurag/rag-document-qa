import React, { useState, useEffect, useRef } from 'react';
import { Send, Paperclip, Loader2, FileText, Sparkles, Bot, User as UserIcon, ThumbsUp, ThumbsDown, RotateCcw, Edit2, ChevronLeft, ChevronRight, X, Check, Square } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import api from '../api';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { useParams, useNavigate } from 'react-router-dom';
import CodeBlock from '../components/CodeBlock';
import ChartRenderer from '../components/ChartRenderer';

// Simple Message Component
const MessageItem = ({ msg, idx, onFeedback, onRerun, onEdit, isEditing, onSaveEdit, onCancelEdit, onVersionChange }) => {
    const [feedback, setFeedback] = useState(null);
    const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
    const [editContent, setEditContent] = useState(msg.content);

    // Update edit box when message changes
    useEffect(() => {
        if (isEditing) {
            setEditContent(msg.content);
        }
    }, [isEditing, msg.content]);

    // Version details
    let currentVer = 1;
    if (msg.currentVersionIndex !== undefined) {
        currentVer = msg.currentVersionIndex + 1;
    }

    let totalVer = 1;
    if (msg.versions) {
        totalVer = msg.versions.length;
    }

    const hasMultipleVersions = totalVer > 1;

    return (
        <div className={`group flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'} w-full`}>

            {/* Bot Icon */}
            {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-violet-600 flex-shrink-0 flex items-center justify-center text-white shadow-lg mt-1">
                    <Bot size={16} />
                </div>
            )}

            <div className={`flex flex-col gap-2 ${isEditing ? 'w-full max-w-full' : 'max-w-[85%] md:max-w-[75%]'} ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>

                {/* Edit Mode or View Mode */}
                {isEditing ? (
                    <div className="w-full bg-zinc-800 p-4 rounded-xl border border-zinc-700 shadow-xl animate-in fade-in duration-200">
                        <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="w-full bg-zinc-900/50 text-white p-3 rounded-lg border border-zinc-700 focus:border-blue-500 outline-none resize-none min-h-[100px] text-sm font-mono leading-relaxed"
                            placeholder="Edit your message..."
                            autoFocus
                        />
                        <div className="flex justify-between items-center mt-3">
                            <div className="text-xs text-zinc-500 italic">
                                Editing will restart the conversation from here.
                            </div>
                            <div className="flex gap-2">
                                <button onClick={onCancelEdit} className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-xs font-medium text-white transition-colors flex items-center gap-1 cursor-pointer">
                                    <X size={12} /> Cancel
                                </button>
                                <button onClick={() => onSaveEdit(idx, editContent)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-medium text-white transition-colors flex items-center gap-1 cursor-pointer">
                                    <Check size={12} /> Save & Submit
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    // Message Bubble
                    // Removed extra border for assistant as requested
                    <div
                        className={`rounded-2xl px-6 py-4 shadow-sm text-sm md:text-base leading-relaxed overflow-hidden ${msg.role === 'user'
                            ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-br-none'
                            : 'bg-transparent text-zinc-800 dark:text-zinc-100 rounded-tl-none w-full'
                            }`}
                    >
                        {msg.role === 'user' ? (
                            <div className="whitespace-pre-wrap">
                                {msg.content.split(/(\[Attached: .*?\])/g).map((part, i) => {
                                    const match = part.match(/\[Attached: (.*?)\]/);
                                    if (match) {
                                        return (
                                            <span key={i} className="inline-flex items-center gap-1.5 bg-zinc-200 dark:bg-black/20 px-2 py-0.5 rounded-md text-xs text-zinc-700 dark:text-zinc-300 mx-1 align-baseline border border-zinc-300 dark:border-white/10">
                                                <FileText size={12} className="text-blue-600 dark:text-blue-400" />
                                                <span className="font-medium">{match[1]}</span>
                                            </span>
                                        );
                                    }
                                    return <span key={i}>{part}</span>;
                                })}
                            </div>
                        ) : (
                            <div className="markdown-body">
                                <ReactMarkdown
                                    children={msg.content}
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                        code({ inline, className, children, ...props }) {
                                            const match = /language-(\w+)/.exec(className || '');
                                            if (!inline && match) {
                                                const codeString = String(children).replace(/\n$/, '');
                                                return (
                                                    <CodeBlock
                                                        language={match[1]}
                                                        value={codeString}
                                                        {...props}
                                                    />
                                                );
                                            } else {
                                                return (
                                                    <code className="bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-sm font-mono text-zinc-900 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700" {...props}>
                                                        {children}
                                                    </code>
                                                );
                                            }
                                        },
                                        p: ({ children }) => <p className="mb-4 last:mb-0 leading-7 text-zinc-800 dark:text-zinc-200">{children}</p>,
                                        ul: ({ children }) => <ul className="list-disc pl-4 mb-4 space-y-1 text-zinc-800 dark:text-zinc-200">{children}</ul>,
                                        ol: ({ children }) => <ol className="list-decimal pl-4 mb-4 space-y-1 text-zinc-800 dark:text-zinc-200">{children}</ol>,
                                        li: ({ children }) => <li className="mb-1">{children}</li>,
                                        h1: ({ children }) => <h1 className="text-2xl font-bold mb-4 mt-6 first:mt-0 text-zinc-900 dark:text-white">{children}</h1>,
                                        h2: ({ children }) => <h2 className="text-xl font-bold mb-3 mt-5 text-zinc-900 dark:text-white">{children}</h2>,
                                        h3: ({ children }) => <h3 className="text-lg font-bold mb-2 mt-4 text-zinc-900 dark:text-white">{children}</h3>,
                                        blockquote: ({ children }) => <blockquote className="border-l-4 border-zinc-300 dark:border-zinc-500 pl-4 py-1 italic text-zinc-600 dark:text-zinc-400 mb-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-r">{children}</blockquote>,
                                        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">{children}</a>,
                                        img: () => null // Suppress images as we render charts separately
                                    }}
                                />
                            </div>
                        )}

                        {/* Sources Section */}
                        {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                            <div className="mt-4 pt-3 border-t border-zinc-800/50">
                                <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                                    <FileText size={12} /> Sources
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {msg.sources.map((source, i) => (
                                        <a key={i} href={source.url || '#'} className="max-w-xs truncate bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-md hover:bg-zinc-800 hover:border-zinc-700 transition-all text-xs text-zinc-400 block cursor-pointer">
                                            {source.title || "Document"}
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Chart Section */}
                        {msg.chart && (
                            <div className="mt-4">
                                <ChartRenderer chartConfig={msg.chart} />
                            </div>
                        )}
                    </div>
                )}

                {/* Action Buttons (Edit, Feedback, Rerun) */}
                {!isEditing && (
                    <div className={`flex items-center gap-2 px-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>

                        {/* Version Buttons */}
                        {hasMultipleVersions && (
                            <div className="flex items-center text-zinc-600 text-xs mr-2 select-none bg-zinc-900/50 rounded-full px-2 py-0.5 border border-zinc-800">
                                <button
                                    onClick={() => onVersionChange(idx, -1)}
                                    disabled={currentVer <= 1}
                                    className={`p-1 hover:text-white transition-colors cursor-pointer ${currentVer <= 1 ? 'opacity-30 cursor-not-allowed' : ''}`}
                                >
                                    <ChevronLeft size={12} />
                                </button>
                                <span className="mx-1 font-mono min-w-[20px] text-center">{currentVer}/{totalVer}</span>
                                <button
                                    onClick={() => onVersionChange(idx, 1)}
                                    disabled={currentVer >= totalVer}
                                    className={`p-1 hover:text-white transition-colors cursor-pointer ${currentVer >= totalVer ? 'opacity-30 cursor-not-allowed' : ''}`}
                                >
                                    <ChevronRight size={12} />
                                </button>
                            </div>
                        )}

                        {msg.role === 'assistant' ? (
                            <>
                                <button
                                    onClick={() => {
                                        onFeedback(idx, 'up');
                                        setFeedback('up');
                                        setFeedbackSubmitted(true);
                                        setTimeout(() => setFeedbackSubmitted(false), 2000);
                                    }}
                                    className={`p-1 transition-all cursor-pointer ${feedback === 'up' ? 'text-green-400 scale-110' : 'text-zinc-500 hover:text-green-400'}`}
                                    title="Helpful">
                                    <ThumbsUp size={14} fill={feedback === 'up' ? "currentColor" : "none"} />
                                </button>
                                <button
                                    onClick={() => {
                                        onFeedback(idx, 'down');
                                        setFeedback('down');
                                        setFeedbackSubmitted(true);
                                        setTimeout(() => setFeedbackSubmitted(false), 2000);
                                    }}
                                    className={`p-1 transition-all cursor-pointer ${feedback === 'down' ? 'text-red-400 scale-110' : 'text-zinc-500 hover:text-red-400'}`}
                                    title="Not Helpful">
                                    <ThumbsDown size={14} fill={feedback === 'down' ? "currentColor" : "none"} />
                                </button>
                                <button onClick={() => onRerun(idx)} className="p-1 text-zinc-500 hover:text-blue-400 transition-colors cursor-pointer" title="Regenerate"><RotateCcw size={14} /></button>
                                {feedbackSubmitted && (
                                    <span className="opacity-0 animate-in fade-in zoom-in duration-300 fill-mode-forwards text-[10px] text-zinc-400 bg-zinc-800/80 px-2 py-0.5 rounded-full border border-zinc-700/50 ml-1">
                                        Agent learned from this
                                    </span>
                                )}
                            </>
                        ) : (
                            <button onClick={() => onEdit(idx)} className="p-1 text-zinc-500 hover:text-white transition-colors cursor-pointer" title="Edit"><Edit2 size={14} /></button>
                        )}
                    </div>
                )}
            </div>

            {/* User Avatar */}
            {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex-shrink-0 flex items-center justify-center text-zinc-400 mt-1">
                    <UserIcon size={16} />
                </div>
            )}
        </div>
    );
};

const Chat = () => {
    const { chatId } = useParams(); // URL source of truth
    const navigate = useNavigate();
    const currentChatId = chatId; // Internal alias

    // State variables
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [file, setFile] = useState(null);
    const [filePath, setFilePath] = useState(null); // Backend path
    const [uploading, setUploading] = useState(false);
    const [editingIndex, setEditingIndex] = useState(null);

    // Refs
    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const inputRef = useRef(null);
    const abortControllerRef = useRef(null); // Ref for abortion

    // Settings
    const { model, systemPrompt } = useSettings();

    // Effect to load messages on chat change
    useEffect(() => {
        if (currentChatId) {
            loadMessages(currentChatId);
        } else {
            setMessages([]);
        }
    }, [currentChatId]);

    // Effect to scroll to bottom on new messages (with slight delay)
    useEffect(() => {
        setTimeout(() => {
            scrollToBottom();
        }, 100);
    }, [messages.length, loading]);

    // Helper to scroll
    const scrollToBottom = () => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    };

    // Load message history from backend
    const loadMessages = async (id) => {
        try {
            const res = await api.get(`/chat/history/${id}`);
            let rawData = [];
            if (Array.isArray(res.data)) {
                rawData = res.data;
            }

            // Convert simple backend messages to frontend versioned format
            const formattedMessages = rawData.map(msg => {
                return {
                    ...msg,
                    versions: [{ content: msg.content, sources: msg.sources }],
                    currentVersionIndex: 0
                };
            });

            setMessages(formattedMessages);
            setTimeout(scrollToBottom, 100);

        } catch (error) {
            console.error("Failed to load history:", error);
            setMessages([]);
        }
    };

    // Handle File Upload
    const { user } = useAuth(); // Need to check if user is logged in

    const handleFileChange = async (e) => {
        try {
            // Guest Upload Limit Check
            if (!user) {
                const guestUploads = parseInt(localStorage.getItem('guest_upload_count') || '0');
                if (guestUploads >= 5) {
                    alert("Guest upload limit reached (5 files). Please log in to continue uploading.");
                    // Clear input
                    if (fileInputRef.current) fileInputRef.current.value = '';
                    return;
                }
            }

            const selectedFile = e.target.files[0];
            if (!selectedFile) return;

            // File Type Check (Only PDF and Word doc/docx allowed)
            const fileExtension = selectedFile.name.split('.').pop().toLowerCase();
            const allowedExtensions = ['pdf', 'doc', 'docx'];
            if (!allowedExtensions.includes(fileExtension)) {
                alert("Only PDF and Word (.doc, .docx) files are allowed.");
                if (fileInputRef.current) fileInputRef.current.value = '';
                return;
            }

            // File Size Check (Limit 5MB to prevent token overflow)
            if (selectedFile.size > 5 * 1024 * 1024) {
                alert("File is too large. Please upload files smaller than 5MB.");
                if (fileInputRef.current) fileInputRef.current.value = '';
                return;
            }

            setUploading(true);
            const formData = new FormData();
            formData.append('file', selectedFile);

            // Nested try-catch for API call specifically
            try {
                const res = await api.post('/documents/upload', formData);
                setFile(selectedFile);
                if (res.data.file_path) {
                    setFilePath(res.data.file_path);
                }

                // Increment guest count on success
                if (!user) {
                    const current = parseInt(localStorage.getItem('guest_upload_count') || '0');
                    localStorage.setItem('guest_upload_count', (current + 1).toString());
                }

            } catch (uploadError) {
                console.error("Upload Error:", uploadError);
                alert("Could not upload file.");
            }

        } catch (err) {
            console.error("General file error:", err);
        } finally {
            setUploading(false);
        }
    };

    // Core Chat API function with RETRY LOGIC
    const callChatApi = async (messageText, tempFile, currentHistory, targetIndex = null, isRerun = false) => {
        setLoading(true);

        // Create new AbortController
        if (abortControllerRef.current) abortControllerRef.current.abort(); // Cancel previous if any
        const controller = new AbortController();
        abortControllerRef.current = controller;
        let attempt = 0;
        const maxAttempts = 2;
        let success = false;

        while (attempt <= maxAttempts && !success) {
            try {
                // Simplify history for backend - REMOVED (Backend fetches its own history)
                // const historyForBackend = ...

                const payload = {
                    message: messageText + (tempFile ? ` (Context: Processed file ${tempFile.name})` : ''),
                    conversation_id: currentChatId,
                    model: model,
                    system_prompt: systemPrompt,
                    file_path: filePath // Send path for EDA
                };

                const res = await api.post('/chat/', payload, {
                    signal: controller.signal // Pass signal to axios
                });

                const newContent = res.data.response;
                const newSources = res.data.sources;
                const newChart = res.data.chart;
                const newConvId = res.data.conversation_id;

                // If URL ID was missing (new chat), navigate to new URL
                if (!currentChatId && newConvId) {
                    navigate(`/c/${newConvId}`, { replace: true });
                }

                // Success! Update State
                setMessages(prev => {
                    const newMsgs = [...prev];

                    if (isRerun && targetIndex !== null) {
                        // We are updating an existing message (Rerun)
                        const targetMsg = newMsgs[targetIndex];

                        // Add new version
                        let newVersions = [];
                        if (targetMsg.versions) {
                            newVersions = [...targetMsg.versions];
                        }
                        newVersions.push({ content: newContent, sources: newSources });

                        newMsgs[targetIndex] = {
                            ...targetMsg,
                            content: newContent,
                            sources: newSources,
                            chart: newChart,
                            versions: newVersions,
                            currentVersionIndex: newVersions.length - 1
                        };
                    } else {
                        // New Assistant Message
                        const botMsg = {
                            role: 'assistant',
                            content: newContent,
                            sources: newSources,
                            chart: newChart,
                            versions: [{ content: newContent, sources: newSources }],
                            currentVersionIndex: 0
                        };
                        newMsgs.push(botMsg);
                    }
                    return newMsgs;
                });

                success = true; // Break loop

            } catch (apiError) {
                // If canceled, stop immediately
                if (apiError.name === 'CanceledError' || apiError.code === "ERR_CANCELED") {
                    setMessages(prev => [...prev, {
                        role: 'assistant',
                        content: "Response stopped by user.",
                        versions: [],
                        currentVersionIndex: 0
                    }]);
                    break;
                }

                console.error(`API Attempt ${attempt + 1} failed:`, apiError);
                attempt++;

                if (attempt >= maxAttempts) {
                    const errorDetail = apiError.response?.data?.detail || apiError.message;
                    const errorStack = apiError.response?.data?.stack ? `\n\nStack: ${apiError.response.data.stack}` : '';

                    // Recover conversation ID if available (to prevent duplicates on retry)
                    const recoveredId = apiError.response?.data?.conversation_id;
                    if (recoveredId && !currentChatId) {
                        navigate(`/c/${recoveredId}`, { replace: true });
                    }

                    if (!isRerun) {
                        setMessages(prev => [...prev, {
                            role: 'assistant',
                            content: `Error: ${errorDetail}${errorStack}\n\nCould not get response after retrying.`,
                            versions: [],
                            currentVersionIndex: 0
                        }]);
                    }
                }
            }
        }

        setLoading(false);
        abortControllerRef.current = null;
    };

    const handleStop = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            setLoading(false);
            abortControllerRef.current = null;
        }
    };

    // Send Message Handler
    const sendMessage = async (e) => {
        e.preventDefault();

        if ((!input.trim() && !file) || loading) return;

        const textToSend = input;
        const fileToSend = file;

        // Reset inputs
        setInput('');
        setFile(null);
        // setFilePath(null); // REMOVED: Keep context for follow-up questions

        // Optimistically add user message
        const userMsg = {
            role: 'user',
            content: textToSend + (fileToSend ? `\n[Attached: ${fileToSend.name}]` : ''),
            versions: [{ content: textToSend, sources: [] }],
            currentVersionIndex: 0
        };

        const updatedMsgs = [...messages, userMsg];
        setMessages(updatedMsgs);

        // Call API
        await callChatApi(textToSend, fileToSend, updatedMsgs);
    };

    // Feedback Handler
    const handleFeedback = async (idx, type) => {
        try {
            await api.post('/feedback/', {
                message_id: currentChatId || 'unknown',
                type: type,
                comment: `Feedback for msg index ${idx}`
            });
        } catch (err) {
            console.error("Feedback failed:", err);
        }
    };

    // Rerun Handler
    const handleRerun = async (idx) => {
        if (idx === 0) return;

        const msgsBefore = messages.slice(0, idx);
        const lastUserMsg = msgsBefore[msgsBefore.length - 1];

        await callChatApi(lastUserMsg.content, null, msgsBefore, idx, true);
    };

    // Edit Handlers
    const handleEdit = (idx) => {
        setEditingIndex(idx);
    };

    const handleSaveEdit = async (idx, newContent) => {
        setEditingIndex(null);

        // 1. Truncate future (Branching)
        const branchHistory = messages.slice(0, idx + 1);
        const targetMsg = branchHistory[idx];

        // 2. Add version to User Message
        let newVersions = [];
        if (targetMsg.versions) newVersions = [...targetMsg.versions];
        newVersions.push({ content: newContent, sources: [] });

        const updatedUserMsg = {
            ...targetMsg,
            content: newContent,
            versions: newVersions,
            currentVersionIndex: newVersions.length - 1
        };
        branchHistory[idx] = updatedUserMsg;

        setMessages(branchHistory);

        // 3. Get new response
        await callChatApi(newContent, null, branchHistory);
    };

    const handleCancelEdit = () => {
        setEditingIndex(null);
    };

    // Version Navigation
    const handleVersionChange = (idx, direction) => {
        setMessages(prev => {
            const newMsgs = [...prev];
            const msg = newMsgs[idx];
            const newIdx = msg.currentVersionIndex + direction;

            if (newIdx >= 0 && newIdx < msg.versions.length) {
                const ver = msg.versions[newIdx];
                newMsgs[idx] = {
                    ...msg,
                    content: ver.content,
                    sources: ver.sources,
                    currentVersionIndex: newIdx
                };
            }
            return newMsgs;
        });
    };

    return (
        <div className="flex flex-col h-full max-w-5xl mx-auto w-full relative">

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 custom-scrollbar">

                {/* Empty State */}
                {messages.length === 0 && !loading && (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-600 dark:text-zinc-400 space-y-6">
                        <div className="w-20 h-20 bg-white dark:bg-zinc-900 rounded-3xl flex items-center justify-center border border-zinc-200 dark:border-zinc-800 shadow-xl dark:shadow-2xl">
                            <Sparkles className="text-blue-600 dark:text-blue-500" size={32} />
                        </div>
                        <div className="text-center max-w-md">
                            <h3 className="text-xl font-semibold text-zinc-900 dark:text-white mb-2">How can I help you today?</h3>
                            <p className="text-zinc-500 dark:text-zinc-400">Active Model: <span className="text-blue-600 dark:text-blue-400 font-medium">{model}</span></p>
                            <p className="text-zinc-400 dark:text-zinc-500 text-xs mt-2">I strictly follow your instructions and verify logic.</p>
                        </div>
                    </div>
                )}

                {/* Message List */}
                {messages.map((msg, idx) => (
                    <MessageItem
                        key={idx}
                        msg={msg}
                        idx={idx}
                        onFeedback={handleFeedback}
                        onRerun={handleRerun}
                        onEdit={handleEdit}
                        isEditing={idx === editingIndex}
                        onSaveEdit={handleSaveEdit}
                        onCancelEdit={handleCancelEdit}
                        onVersionChange={handleVersionChange}
                    />
                ))}

                {/* Loading State */}
                {loading && (
                    <div className="flex justify-start gap-4">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-violet-600 flex-shrink-0 flex items-center justify-center text-white shadow-lg animate-pulse mt-1">
                            <Bot size={16} />
                        </div>
                        <div className="bg-transparent border border-zinc-800 rounded-2xl rounded-tl-none px-6 py-4 flex items-center gap-3 text-zinc-400">
                            <Loader2 className="animate-spin text-blue-500" size={18} />
                            <span className="text-sm">Thinking & Validating...</span>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 md:p-6 bg-white/80 dark:bg-black/80 backdrop-blur-md sticky bottom-0 z-20 transition-colors duration-300">
                <div className="max-w-4xl mx-auto">

                    {/* Attached File */}
                    {file && (
                        <div className="mb-3 inline-flex items-center gap-2 bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 px-4 py-2 rounded-xl text-sm border border-blue-200 dark:border-blue-500/20 shadow-lg dark:shadow-blue-900/10">
                            <FileText size={14} />
                            <span className="font-medium max-w-xs truncate">{file.name}</span>
                            <button onClick={() => { setFile(null); setFilePath(null); }} className="ml-2 hover:text-black dark:hover:text-white p-1 rounded-full hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors cursor-pointer" title="Remove attachment">×</button>
                        </div>
                    )}

                    {/* Persistent File Context Indicator (if no new file attached but context exists) */}
                    {!file && filePath && (
                        <div className="mb-3 inline-flex items-center gap-2 bg-zinc-100 text-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-400 px-3 py-1.5 rounded-lg text-xs border border-zinc-200 dark:border-zinc-700/50">
                            <Sparkles size={12} className="text-yellow-600 dark:text-yellow-500/70" />
                            <span>Context Active: </span>
                            <span className="font-mono opacity-70 max-w-[150px] truncate">{filePath.split('/').pop().split('-').slice(2).join('-') || "File"}</span>
                            <button onClick={() => setFilePath(null)} className="ml-2 hover:text-black dark:hover:text-white p-0.5 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer" title="Clear context">×</button>
                        </div>
                    )}

                    {/* Input Form */}
                    <form onSubmit={sendMessage} className="relative flex items-end gap-2 bg-gray-50 dark:bg-zinc-900 p-2 pl-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 focus-within:border-zinc-300 dark:focus-within:border-zinc-700 focus-within:ring-1 focus-within:ring-zinc-300 dark:focus-within:ring-zinc-700 transition-all shadow-xl">
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            className="hidden"
                            accept=".pdf,.doc,.docx"
                        />

                        {/* Attach Button */}
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={uploading}
                            className={`p-2.5 mb-0.5 rounded-xl text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all cursor-pointer ${uploading ? 'animate-pulse' : ''}`}
                            title="Attach Document"
                        >
                            {uploading ? <Loader2 className="animate-spin" size={20} /> : <Paperclip size={20} />}
                        </button>

                        {/* Text Input */}
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    sendMessage(e);
                                }
                            }}
                            placeholder="Message..."
                            className="flex-1 bg-transparent text-zinc-900 dark:text-white px-2 py-3.5 max-h-32 min-h-[50px] focus:outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-600 resize-none text-base"
                            disabled={loading}
                            rows={1}
                        />

                        {/* Send / Stop Button */}
                        {loading ? (
                            <button
                                type="button"
                                onClick={handleStop}
                                className="p-2.5 mb-0.5 bg-zinc-900 dark:bg-white text-white dark:text-black rounded-xl hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-all shadow-lg active:scale-95 cursor-pointer"
                                title="Stop generating"
                            >
                                <Square size={18} fill="currentColor" />
                            </button>
                        ) : (
                            <button
                                type="submit"
                                disabled={(!input.trim() && !file)}
                                className="p-2.5 mb-0.5 bg-zinc-900 dark:bg-white text-white dark:text-black rounded-xl hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:hover:bg-zinc-900 dark:disabled:hover:bg-white transition-all shadow-lg active:scale-95 cursor-pointer"
                            >
                                <Send size={18} />
                            </button>
                        )}
                    </form>

                    <div className="text-center text-[10px] md:text-xs text-zinc-700 mt-3 font-medium cursor-default">
                        Using {model} • AI can make mistakes.
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Chat;
