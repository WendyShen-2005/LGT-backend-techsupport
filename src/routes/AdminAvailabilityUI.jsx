import React, { useState, useEffect } from "react";
import "./adminAvailability.css";

// Convert UTC ISO timestamp to Toronto local time components.
// Returns { dateKey: "YYYY-MM-DD", timeKey: "H:MM" }
function utcToTorontoTime(isoString) {
  const utcDate = new Date(isoString);

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(utcDate);
  const timeObj = {};
  parts.forEach(({ type, value }) => {
    timeObj[type] = value;
  });

  const dateKey = `${timeObj.year}-${timeObj.month}-${timeObj.day}`;
  const hour = parseInt(timeObj.hour, 10);
  const timeKey = `${hour}:${timeObj.minute}`;

  return { dateKey, timeKey };
}

// Utility to get dates for the week two weeks from now
function getWeekTwoWeeksFromNow() {
  const start = new Date();
  start.setDate(start.getDate() + 14);
  // Move to Monday
  const day = start.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  start.setDate(start.getDate() + diff);

  return Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

// Generate 30-min blocks from 8am to 8pm
function generateTimeBlocks() {
  const blocks = [];
  for (let h = 8; h < 20; h++) {
    blocks.push(`${h}:00`);
    blocks.push(`${h}:30`);
  }
  return blocks;
}

const ADMINS = ["Alice", "Bob", "Carlos", "Diana"];

export default function AdminAvailabilityUI() {
  const [selectedAdmin, setSelectedAdmin] = useState("");
  const [weekDates, setWeekDates] = useState([]);
  const [availability, setAvailability] = useState({});
  const [isDragging, setIsDragging] = useState(false);
  const [dragValue, setDragValue] = useState(true);

  useEffect(() => {
    setWeekDates(getWeekTwoWeeksFromNow());
  }, []);

  const timeBlocks = generateTimeBlocks();

  const toggleSlot = (dateKey, time) => {
    setAvailability((prev) => {
      const day = prev[dateKey] || {};
      const newVal = !day[time];
      return {
        ...prev,
        [dateKey]: { ...day, [time]: newVal },
      };
    });
  };

  const handleMouseDown = (dateKey, time) => {
    setIsDragging(true);
    const current = availability[dateKey]?.[time] || false;
    setDragValue(!current);
    setAvailability((prev) => ({
      ...prev,
      [dateKey]: { ...(prev[dateKey] || {}), [time]: !current },
    }));
  };

  const handleMouseEnter = (dateKey, time) => {
    if (!isDragging) return;
    setAvailability((prev) => ({
      ...prev,
      [dateKey]: { ...(prev[dateKey] || {}), [time]: dragValue },
    }));
  };

  const handleMouseUp = () => setIsDragging(false);

  useEffect(() => {
    if (!selectedAdmin) {
      setAvailability({});
      return;
    }

    // load availability for the selected admin from server, which now stores
    // slots in an "availability" table keyed by tech_support_admin_name.
    fetch(`/api/availability?tech_support_admin_name=${encodeURIComponent(
      selectedAdmin
    )}`)
      .then((res) => res.json())
      .then((rows) => {
        // server returns an array of slot records -- convert to the
        // { dateKey: { time: true } } structure the UI uses internally.
        const converted = {};
        (rows || []).forEach((r) => {
          const { dateKey, timeKey } = utcToTorontoTime(r.date);
          if (!converted[dateKey]) converted[dateKey] = {};
          converted[dateKey][timeKey] = true;
        });
        setAvailability(converted);
      })
      .catch((err) => console.error('Failed to load availability', err));
  }, [selectedAdmin]);

  const handleSubmit = async () => {
    if (!selectedAdmin) {
      alert('Please select an admin before submitting.');
      return;
    }

    // send payload matching the new table schema. the server still
    // understands the legacy "adminName" key, but we prefer to use the
    // new column name directly.
    const payload = { tech_support_admin_name: selectedAdmin, availability };

    try {
      const res = await fetch('/api/availability', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Server error');
      }

      const json = await res.json();
      console.log('Saved availability:', json);
      alert('Availability saved successfully.');
    } catch (err) {
      console.error(err);
      alert('Failed to save availability. See console for details.');
    }
  };


  return (
    <div className="p-6 max-w-6xl mx-auto font-sans">
      <h1 className="text-2xl font-bold mb-2">Admin Availability Scheduler</h1>
      <p className="text-gray-600 mb-4">
        1) Select your name. 2) Click or drag across time blocks to mark when you are available for 30-minute calls. 3) Click Submit when finished.
      </p>

      <div className="mb-4">
        <label className="font-medium mr-2">Select Admin:</label>
        <select
          value={selectedAdmin}
          onChange={(e) => setSelectedAdmin(e.target.value)}
          className="border rounded px-2 py-1"
        >
          <option value="">-- Choose your name --</option>
          {ADMINS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {selectedAdmin && (
        <div onMouseUp={handleMouseUp} className="overflow-x-auto">
          <table className="border-collapse">
            <thead>
              <tr>
                <th className="border p-2 bg-gray-100">Time</th>
                {weekDates.map((d) => {
                  const key = d.toISOString().slice(0, 10);
                  return (
                    <th key={key} className="border p-2 bg-gray-100">
                      {d.toDateString()}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {timeBlocks.map((t) => (
                <tr key={t}>
                  <td className="border p-1 text-sm bg-gray-50">{t}</td>
                  {weekDates.map((d) => {
                    const dateKey = d.toISOString().slice(0, 10);
                    const isOn = availability[dateKey]?.[t];
                    return (
                      <td
                        key={dateKey + t}
                        className={`border w-24 h-8 cursor-pointer ${isOn ? "bg-green-400" : "bg-white"}`}
                        onMouseDown={() => handleMouseDown(dateKey, t)}
                        onMouseEnter={() => handleMouseEnter(dateKey, t)}
                        title="Click or drag to mark available"
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedAdmin && (
        <div className="mt-4">
          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700"
          >
            Submit Availability
          </button>
        </div>
      )}

      <div className="mt-6 text-sm text-gray-500">
        <p>Green blocks = available. White blocks = unavailable.</p>
        <p>Tip: Click and drag vertically to mark multiple slots quickly.</p>
      </div>
    </div>
  );
}
