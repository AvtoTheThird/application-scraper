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

    const progressPercent = status.total > 0 ? (status.progress / status.total) * 100 : 0;

    return (
        <div className="min-h-screen bg-gray-900 text-white p-8">
            <div className="max-w-6xl mx-auto">
                <h1 className="text-4xl font-bold mb-8 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-600">
                    Scraper Control Panel
                </h1>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
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
            </div>
        </div>
    );
}
