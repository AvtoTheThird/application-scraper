"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function Home() {
  const router = useRouter();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    // Fetch overall stats
    fetch(process.env.NEXT_PUBLIC_API_URL + "/api/stickers")
      .then((res) => res.json())
      .then((data) => {
        const totalStickers = data.length;
        const totalApplications = data.reduce((sum, s) => {
          return sum + (s.applications["1x"]?.count || 0);
        }, 0);
        setStats({ totalStickers, totalApplications });
      })
      .catch(console.error);
  }, []);

  const collections = [
    {
      id: "elemental_crafts",
      name: "Elemental Crafts",
      gradient: "from-red-500 to-orange-500",
      image: "/elemental_crafts.png",
    },
    {
      id: "character_crafts",
      name: "Character Crafts",
      gradient: "from-blue-500 to-purple-500",
      image: "/character_craft.png",
    },
    {
      id: "Budapest 2025 Legends Sticker Capsule",
      name: "Budapest 2025 Legends Sticker Capsule",
      gradient: "from-blue-500 to-purple-500",
      image: "/budapest_2025_legends.png",
    },
    {
      id: "Budapest 2025 Challengers Sticker Capsule",
      name: "Budapest 2025 Challengers Sticker Capsule",
      gradient: "from-blue-500 to-purple-500",
      image: "/budapest_2025_challengers.png",
    },
  ];

  return (
    <div className="min-h-screen">
      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-cs-orange to-red-600 py-20 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-6">
            CS:GO Sticker Investment Tracker
          </h1>
          <p className="text-xl md:text-2xl mb-8 text-white/90">
            Track application trends and discover the best sticker investments
          </p>
          <div className="flex flex-col md:flex-row gap-4 justify-center items-center text-lg">
            <div className="bg-white/20 backdrop-blur-sm px-6 py-3 rounded-lg">
              <span className="font-bold text-2xl">
                {stats?.totalStickers || "..."}
              </span>
              <span className="ml-2">Stickers Tracked</span>
            </div>
            <div className="bg-white/20 backdrop-blur-sm px-6 py-3 rounded-lg">
              <span className="font-bold text-2xl">
                {stats?.totalApplications?.toLocaleString() || "..."}
              </span>
              <span className="ml-2">Total Applications</span>
            </div>
          </div>
        </div>
      </div>

      {/* About Section */}
      <div className="max-w-6xl mx-auto py-12 px-4">
        <div className="card mb-12">
          <h2 className="text-3xl font-bold mb-4">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-6 text-center">
            <div>
              <div className="text-4xl mb-3">📊</div>
              <h3 className="text-xl font-semibold mb-2">Track Applications</h3>
              <p className="text-gray-400">
                Monitor how many times each sticker has been applied to weapons
              </p>
            </div>
            <div>
              <div className="text-4xl mb-3">📈</div>
              <h3 className="text-xl font-semibold mb-2">Analyze Trends</h3>
              <p className="text-gray-400">
                See historical growth patterns and identify emerging popular
                stickers
              </p>
            </div>
            <div>
              <div className="text-4xl mb-3">💰</div>
              <h3 className="text-xl font-semibold mb-2">
                Make Smart Investments
              </h3>
              <p className="text-gray-400">
                Find undervalued stickers with high growth potential before they
                spike
              </p>
            </div>
          </div>
        </div>

        {/* Collections */}
        <h2 className="text-3xl font-bold mb-6">Browse Collections</h2>
        <div className="grid md:grid-cols-4 gap-6">
          {collections.map((collection) => (
            <button
              key={collection.id}
              onClick={() => router.push(`/collection/${collection.id}`)}
              className="
              card text-left cursor-pointer transition-transform 
              bg-slate-900/50 hover:bg-slate-900 hover:scale-105 
              rounded-2xl p-4
            "
            >
              <div className="relative w-48 h-48 mb-4 rounded-lg overflow-hidden flex items-center justify-center">
                <img
                  src={`stickers/${collection.image}`}
                  alt={collection.name}
                  className="w-40 h-40 object-contain"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = '/stickers/placeholder.jpg';
                  }}
                />
              </div>

              {/* Text with padding */}
              <div className="pl-2">
                <div className="flex items-center mb-2">
                  <h3 className="text-2xl font-bold">{collection.name}</h3>
                </div>

                <div className="text-cs-orange font-semibold">
                  View Collection →
                </div>
              </div>
            </button>

          ))}
        </div>
      </div>
    </div>
  );
}
