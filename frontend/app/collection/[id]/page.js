// FILE: frontend/app/collection/[id]/page.js

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';

export default function CollectionPage() {
  const params = useParams();
  const router = useRouter();
  const collectionId = params.id;

  const [stickers, setStickers] = useState([]);
  const [selectedSticker, setSelectedSticker] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [aggregateData, setAggregateData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('aggregate');
  const [visibleLines, setVisibleLines] = useState({
    '1x': true,
    '2x': true,
    '3x': true,
    '4x': true,
    '5x': true
  });

  const collectionNames = {
    elemental_crafts: 'Elemental Crafts',
    character_crafts: 'Character Crafts'
  };

  const rarityColors = {
    blues: { bg: 'bg-blue-500', border: 'border-blue-500' },
    purples: { bg: 'bg-purple-500', border: 'border-purple-500' },
    pinks: { bg: 'bg-pink-500', border: 'border-pink-500' },
    reds: { bg: 'bg-red-500', border: 'border-red-500' }
  };

  const appTypeColors = {
    '1x': '#FF6B35',
    '2x': '#3B82F6',
    '3x': '#8B5CF6',
    '4x': '#EF4444',
    '5x': '#10B981'
  };

  useEffect(() => {
    fetchCollectionData();
  }, [collectionId]);

  const fetchCollectionData = async () => {
    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const res = await fetch(`${API_URL}/api/collections/${collectionId}`);
      const data = await res.json();
      setStickers(data);

      // Calculate aggregate totals for all 5 application types
      const aggregate = {
        '1x': 0,
        '2x': 0,
        '3x': 0,
        '4x': 0,
        '5x': 0
      };

      data.forEach(sticker => {
        if (sticker.applications) {
          Object.entries(sticker.applications).forEach(([type, count]) => {
            aggregate[type] = (aggregate[type] || 0) + (count || 0);
          });
        }
      });

      // Format for bar chart with all 5 types
      const aggregateChartData = [
        { name: '1x Applications', value: aggregate['1x'], fill: appTypeColors['1x'] },
        { name: '2x Applications', value: aggregate['2x'], fill: appTypeColors['2x'] },
        { name: '3x Applications', value: aggregate['3x'], fill: appTypeColors['3x'] },
        { name: '4x Applications', value: aggregate['4x'], fill: appTypeColors['4x'] },
        { name: '5x Applications', value: aggregate['5x'], fill: appTypeColors['5x'] }
      ];

      setAggregateData(aggregateChartData);
      setChartData(aggregateChartData);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch collection data:', error);
      setLoading(false);
    }
  };

  const handleStickerClick = async (sticker) => {
    setSelectedSticker(sticker);
    setViewMode('individual');

    try {
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const res = await fetch(`${API_URL}/api/stickers/${sticker.sticker_id}/history?days=30`);
      const history = await res.json();

      if (history['1x'] && history['1x'].length > 0) {
        const chartData = history['1x'].map((point, index) => ({
          date: new Date(point.timestamp).toLocaleDateString(),
          '1x': point.count,
          '2x': history['2x']?.[index]?.count || 0,
          '3x': history['3x']?.[index]?.count || 0,
          '4x': history['4x']?.[index]?.count || 0,
          '5x': history['5x']?.[index]?.count || 0,
        }));
        setChartData(chartData);
      } else {
        // No historical data - show current as bar chart
        const apps = sticker.applications || {};
        const currentData = [
          { name: '1x Applications', value: apps['1x'] || 0, fill: appTypeColors['1x'] },
          { name: '2x Applications', value: apps['2x'] || 0, fill: appTypeColors['2x'] },
          { name: '3x Applications', value: apps['3x'] || 0, fill: appTypeColors['3x'] },
          { name: '4x Applications', value: apps['4x'] || 0, fill: appTypeColors['4x'] },
          { name: '5x Applications', value: apps['5x'] || 0, fill: appTypeColors['5x'] }
        ];
        setChartData(currentData);
      }
    } catch (error) {
      console.error('Failed to fetch sticker history:', error);
    }
  };

  const showAggregate = () => {
    setViewMode('aggregate');
    setSelectedSticker(null);
    setChartData(aggregateData);
  };

  // Helper to get sticker image URL
  const getStickerImage = (sticker) => {
    // Use imageUrl from config if available, otherwise fallback to local file
    if (sticker.image_url) {
      return sticker.image_url;
    }
    return `/stickers/${sticker.sticker_id}.png`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">Loading collection data...</div>
      </div>
    );
  }

  const isHistoricalData = chartData[0]?.date !== undefined;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="bg-cs-dark border-b border-gray-700 py-6 px-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/')}
              className="text-cs-orange hover:text-orange-400 text-xl"
            >
              ← Back
            </button>
            <h1 className="text-3xl font-bold">{collectionNames[collectionId]}</h1>
          </div>
          <div className="text-gray-400">
            {stickers.length} stickers
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto py-8 px-4">
        {/* Chart Section */}
        <div className="card mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">
              {viewMode === 'aggregate'
                ? `${collectionNames[collectionId]} - Total Applications`
                : selectedSticker?.name
              }
            </h2>

            {/* Tab Selector */}
            <div className="flex gap-2">
              <button
                onClick={showAggregate}
                className={`px-4 py-2 rounded-lg font-semibold transition-colors ${viewMode === 'aggregate'
                  ? 'bg-cs-orange text-white'
                  : 'bg-cs-darker text-gray-400 hover:text-white'
                  }`}
              >
                Collection Total
              </button>
              {selectedSticker && (
                <button
                  className={`px-4 py-2 rounded-lg font-semibold transition-colors flex items-center gap-2 ${viewMode === 'individual'
                    ? 'bg-cs-orange text-white'
                    : 'bg-cs-darker text-gray-400 hover:text-white'
                    }`}
                >
                  <img
                    src={getStickerImage(selectedSticker)}
                    alt=""
                    className="w-6 h-6 object-contain"
                    onError={(e) => e.target.style.display = 'none'}
                  />
                  {selectedSticker.name}
                </button>
              )}
            </div>
          </div>

          {/* Interactive Legend - Click to toggle lines */}
          <div className="flex gap-3 mb-4 justify-center flex-wrap">
            {['1x', '2x', '3x', '4x', '5x'].map((type) => (
              <button
                key={type}
                onClick={() => setVisibleLines(prev => ({ ...prev, [type]: !prev[type] }))}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all ${visibleLines[type]
                  ? 'bg-cs-darker'
                  : 'bg-cs-darker/50 opacity-50'
                  }`}
              >
                <div
                  className={`w-4 h-4 rounded transition-all ${visibleLines[type] ? '' : 'opacity-30'}`}
                  style={{ backgroundColor: appTypeColors[type] }}
                ></div>
                <span className={`text-sm ${visibleLines[type] ? 'text-white' : 'text-gray-500 line-through'}`}>
                  {type} Applications
                </span>
                {visibleLines[type] ? (
                  <span className="text-xs text-green-500">✓</span>
                ) : (
                  <span className="text-xs text-gray-500">○</span>
                )}
              </button>
            ))}
          </div>

          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              {isHistoricalData ? (
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="date" stroke="#888" />
                  <YAxis stroke="#888" />
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #333' }} />
                  {visibleLines['1x'] && <Line type="monotone" dataKey="1x" stroke={appTypeColors['1x']} strokeWidth={3} dot={false} name="1x Applications" />}
                  {visibleLines['2x'] && <Line type="monotone" dataKey="2x" stroke={appTypeColors['2x']} strokeWidth={3} dot={false} name="2x Applications" />}
                  {visibleLines['3x'] && <Line type="monotone" dataKey="3x" stroke={appTypeColors['3x']} strokeWidth={3} dot={false} name="3x Applications" />}
                  {visibleLines['4x'] && <Line type="monotone" dataKey="4x" stroke={appTypeColors['4x']} strokeWidth={3} dot={false} name="4x Applications" />}
                  {visibleLines['5x'] && <Line type="monotone" dataKey="5x" stroke={appTypeColors['5x']} strokeWidth={3} dot={false} name="5x Applications" />}
                </LineChart>
              ) : (
                <BarChart data={chartData.filter(d => visibleLines[d.name.split('x')[0] + 'x'])}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="name" stroke="#888" />
                  <YAxis stroke="#888" />
                  <Tooltip contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #333' }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {chartData.filter(d => visibleLines[d.name.split('x')[0] + 'x']).map((entry, index) => (
                      <rect key={`bar-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {/* Stickers List */}
        <h2 className="text-2xl font-bold mb-4">Stickers in Collection</h2>
        <p className="text-gray-400 mb-6">Click on a sticker to view its application trends</p>

        {['reds', 'pinks', 'purples', 'blues'].map(rarity => {
          const rarityStickers = stickers.filter(s => s.rarity === rarity);
          if (rarityStickers.length === 0) return null;

          return (
            <div key={rarity} className="mb-8">
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <span className={`w-4 h-4 rounded-full ${rarityColors[rarity].bg}`}></span>
                {rarity.charAt(0).toUpperCase() + rarity.slice(1)}
                <span className="text-gray-500 text-sm font-normal">({rarityStickers.length})</span>
              </h3>

              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {rarityStickers.map((sticker) => {
                  const isSelected = selectedSticker?.sticker_id === sticker.sticker_id;
                  const apps = sticker.applications || {};

                  return (
                    <button
                      key={sticker.sticker_id}
                      onClick={() => handleStickerClick(sticker)}
                      className={`card text-left hover:scale-105 transition-all cursor-pointer ${isSelected
                        ? 'ring-2 ring-cs-orange bg-cs-orange/10'
                        : 'hover:bg-cs-dark/80'
                        }`}
                    >
                      <div className="flex items-start gap-4">
                        {/* Sticker Image */}
                        <div className={`w-20 h-20 rounded-lg bg-cs-darker flex items-center justify-center border-2 ${isSelected ? 'border-cs-orange' : 'border-gray-700'
                          }`}>
                          <img
                            src={getStickerImage(sticker)}
                            alt={sticker.name}
                            className="w-16 h-16 object-contain"
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src = '/stickers/placeholder.png';
                            }}
                          />
                        </div>

                        {/* Sticker Info */}
                        <div className="flex-1">
                          <h4 className="text-lg font-semibold mb-2">{sticker.name}</h4>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: appTypeColors['1x'] }}></div>
                              <span className="text-gray-400">1x:</span>
                              <span className="font-bold">{(apps['1x'] || 0).toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: appTypeColors['2x'] }}></div>
                              <span className="text-gray-400">2x:</span>
                              <span className="font-bold">{(apps['2x'] || 0).toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: appTypeColors['3x'] }}></div>
                              <span className="text-gray-400">3x:</span>
                              <span className="font-bold">{(apps['3x'] || 0).toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: appTypeColors['4x'] }}></div>
                              <span className="text-gray-400">4x:</span>
                              <span className="font-bold">{(apps['4x'] || 0).toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: appTypeColors['5x'] }}></div>
                              <span className="text-gray-400">5x:</span>
                              <span className="font-bold">{(apps['5x'] || 0).toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}