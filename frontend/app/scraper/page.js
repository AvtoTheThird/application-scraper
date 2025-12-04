"use client";

import { useState, useEffect, useRef } from "react";

export default function ScraperPage() {
    const [collections, setCollections] = useState([]);
    const [selectedCollections, setSelectedCollections] = useState([]);
    const [status, setStatus] = useState({
        status: "stopped",
        message: "Ready",
        progress: 0,
        total: 0,
        logs: [],
    });
    const [loading, setLoading] = useState(true);
    const logsEndRef = useRef(null);

    // Fetch collections on mount
    useEffect(() => {
        fetch("http://localhost:3001/api/collections")
            .then((res) => res.json())
            .then((data) => {
                setCollections(data);
                setLoading(false);
            })
            .catch((err) => console.error("Failed to load collections", err));
    }, []);

    // Poll status
    useEffect(() => {
        const interval = setInterval(() => {
            fetch("http://localhost:3001/api/scraper/status")
                .then((res) => res.json())
                .then((data) => setStatus(data))
                .catch((err) => console.error("Failed to load status", err));
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    // Scroll logs to bottom
    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [status.logs]);

    const toggleCollection = (collection) => {
        if (selectedCollections.includes(collection)) {
            setSelectedCollections(selectedCollections.filter((c) => c !== collection));
        } else {
            setSelectedCollections([...selectedCollections, collection]);
        }
    };

    const startScraper = async () => {
        try {
            await fetch("http://localhost:3001/api/scraper/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ collections: selectedCollections }),
            });
        } catch (err) {
            console.error("Failed to start scraper", err);
        }
    };

    const stopScraper = async () => {
        try {
            await fetch("http://localhost:3001/api/scraper/stop", {
                method: "POST",
            });
        } catch (err) {
            console.error("Failed to stop scraper", err);
        }
    };

    const [dataFolders, setDataFolders] = useState([]);
    const [selectedFolder, setSelectedFolder] = useState(null);
    const [folderFiles, setFolderFiles] = useState([]);
    const [uploadingFile, setUploadingFile] = useState(null);

    // Fetch data folders
    useEffect(() => {
        fetch("http://localhost:3001/api/data")
            .then((res) => res.json())
            .then((data) => {
                setDataFolders(data);
                if (data.length > 0) setSelectedFolder(data[0]);
            })
            .catch((err) => console.error("Failed to load data folders", err));
    }, []);

    // Fetch files when folder selected
    useEffect(() => {
        if (!selectedFolder) return;
        fetch(`http://localhost:3001/api/data/${selectedFolder}`)
            .then((res) => res.json())
            .then((data) => setFolderFiles(data))
            .catch((err) => console.error("Failed to load folder files", err));
    }, [selectedFolder]);

    const handleManualUpload = async (filename) => {
        if (uploadingFile) return;
        setUploadingFile(filename);
        try {
            const res = await fetch("http://localhost:3001/api/data/upload", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ date: selectedFolder, filename }),
            });
            const data = await res.json();
            if (data.success) {
                // Refresh file list
                const filesRes = await fetch(`http://localhost:3001/api/data/${selectedFolder}`);
                const filesData = await filesRes.json();
                setFolderFiles(filesData);
            }
        } catch (err) {
            console.error("Upload failed", err);
        } finally {
            setUploadingFile(null);
        }
    };

    const progressPercent = status.total > 0 ? (status.progress / status.total) * 100 : 0;

    return (
        <div className="min-h-screen bg-gray-900 text-white p-8">
            <div className="max-w-6xl mx-auto">
                <h1 className="text-4xl font-bold mb-8 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-600">
                    Scraper Control Panel
                </h1>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                    {/* Left Column: Controls */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-lg">
                            <h2 className="text-xl font-semibold mb-4 text-blue-300">Status</h2>
                            <div className="flex items-center space-x-3 mb-4">
                                <div
                                    className={`w-4 h-4 rounded-full ${status.status === "running"
                                        ? "bg-green-500 animate-pulse"
                                        : status.status === "error"
                                            ? "bg-red-500"
                                            : "bg-gray-500"
                                        }`}
                                />
                                <span className="text-lg capitalize font-medium">{status.status}</span>
                            </div>
                            <p className="text-gray-400 text-sm mb-6">{status.message}</p>

                            <div className="space-y-3">
                                <button
                                    onClick={startScraper}
                                    disabled={status.status === "running"}
                                    className={`w-full py-3 rounded-lg font-bold transition-all ${status.status === "running"
                                        ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                                        : "bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-lg hover:shadow-green-500/20"
                                        }`}
                                >
                                    Start Scraper
                                </button>
                                <button
                                    onClick={stopScraper}
                                    disabled={status.status !== "running"}
                                    className={`w-full py-3 rounded-lg font-bold transition-all ${status.status !== "running"
                                        ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                                        : "bg-red-500 hover:bg-red-600 shadow-lg hover:shadow-red-500/20"
                                        }`}
                                >
                                    Stop Scraper
                                </button>
                            </div>
                        </div>

                        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-lg">
                            <h2 className="text-xl font-semibold mb-4 text-purple-300">Collections</h2>
                            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                {loading ? (
                                    <p className="text-gray-500">Loading...</p>
                                ) : (
                                    collections.map((collection) => (
                                        <label
                                            key={collection}
                                            className="flex items-center space-x-3 p-2 rounded hover:bg-gray-700 cursor-pointer transition-colors"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedCollections.includes(collection)}
                                                onChange={() => toggleCollection(collection)}
                                                className="w-5 h-5 rounded border-gray-600 text-blue-500 focus:ring-blue-500 bg-gray-700"
                                            />
                                            <span className="text-sm text-gray-300">{collection}</span>
                                        </label>
                                    ))
                                )}
                            </div>
                            <p className="text-xs text-gray-500 mt-4">
                                {selectedCollections.length === 0
                                    ? "Select collections to scrape (default: all)"
                                    : `${selectedCollections.length} collections selected`}
                            </p>
                        </div>
                    </div>

                    {/* Right Column: Progress & Logs */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Progress Bar */}
                        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-lg">
                            <h2 className="text-xl font-semibold mb-2 text-blue-300">Progress</h2>
                            <div className="flex justify-between text-sm text-gray-400 mb-2">
                                <span>{status.currentSticker || "Waiting..."}</span>
                                <span>
                                    {status.progress} / {status.total}
                                </span>
                            </div>
                            <div className="w-full bg-gray-700 rounded-full h-4 overflow-hidden">
                                <div
                                    className="bg-gradient-to-r from-blue-500 to-purple-500 h-4 rounded-full transition-all duration-500 ease-out"
                                    style={{ width: `${progressPercent}%` }}
                                />
                            </div>
                        </div>

                        {/* Logs */}
                        <div className="bg-gray-950 rounded-xl p-6 border border-gray-800 shadow-inner font-mono text-sm h-[600px] flex flex-col">
                            <h2 className="text-gray-400 mb-4 border-b border-gray-800 pb-2">Live Logs</h2>
                            <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar">
                                {status.logs.length === 0 ? (
                                    <p className="text-gray-600 italic">No logs yet...</p>
                                ) : (
                                    status.logs.slice().reverse().map((log, i) => (
                                        <div key={i} className="text-gray-300 break-words">
                                            <span className="text-gray-600 mr-2">{log.split("]")[0]}]</span>
                                            {log.split("]").slice(1).join("]")}
                                        </div>
                                    ))
                                )}
                                <div ref={logsEndRef} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Data Browser Section */}
                <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-lg">
                    <h2 className="text-2xl font-bold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-teal-500">
                        Data Management
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        {/* Folder List */}
                        <div className="md:col-span-1 bg-gray-900 rounded-lg p-4 h-[400px] overflow-y-auto custom-scrollbar">
                            <h3 className="text-gray-400 text-sm font-semibold mb-3 uppercase tracking-wider">Date Folders</h3>
                            <div className="space-y-2">
                                {dataFolders.map(folder => (
                                    <button
                                        key={folder}
                                        onClick={() => setSelectedFolder(folder)}
                                        className={`w-full text-left px-4 py-3 rounded-lg transition-all ${selectedFolder === folder
                                                ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                                                : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white"
                                            }`}
                                    >
                                        {folder}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* File List */}
                        <div className="md:col-span-3 bg-gray-900 rounded-lg p-4 h-[400px] overflow-y-auto custom-scrollbar">
                            <h3 className="text-gray-400 text-sm font-semibold mb-3 uppercase tracking-wider">
                                Files in {selectedFolder}
                            </h3>
                            {folderFiles.length === 0 ? (
                                <p className="text-gray-500 italic">No files found or no folder selected</p>
                            ) : (
                                <div className="space-y-3">
                                    {folderFiles.map(file => (
                                        <div key={file.filename} className="flex items-center justify-between bg-gray-800 p-4 rounded-lg border border-gray-700 hover:border-gray-600 transition-colors">
                                            <div>
                                                <div className="font-medium text-gray-200">{file.filename}</div>
                                                <div className="text-sm text-gray-500 mt-1">
                                                    {file.uploadedCount} / {file.totalItems} uploaded
                                                </div>
                                            </div>

                                            <div className="flex items-center space-x-4">
                                                <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${file.status === 'uploaded' ? 'bg-green-900/50 text-green-400 border border-green-800' :
                                                        file.status === 'partial' ? 'bg-yellow-900/50 text-yellow-400 border border-yellow-800' :
                                                            'bg-red-900/50 text-red-400 border border-red-800'
                                                    }`}>
                                                    {file.status}
                                                </div>

                                                {file.status !== 'uploaded' && (
                                                    <button
                                                        onClick={() => handleManualUpload(file.filename)}
                                                        disabled={uploadingFile === file.filename}
                                                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${uploadingFile === file.filename
                                                                ? "bg-gray-700 text-gray-500 cursor-wait"
                                                                : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                                                            }`}
                                                    >
                                                        {uploadingFile === file.filename ? "Uploading..." : "Upload"}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
