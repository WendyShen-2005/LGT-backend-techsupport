import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

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
  const hour = parseInt(timeObj.hour, 10); // Remove leading zero
  const timeKey = `${hour}:${timeObj.minute}`;

  return { dateKey, timeKey };
}

export default function BookingTest() {
  const [availabilityMap, setAvailabilityMap] = useState({});
  const [dates, setDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [options, setOptions] = useState([]);
  const [selectedOption, setSelectedOption] = useState(null);
  const navigate = useNavigate();

  // helper that loads availability from the API and applies the same filtering
  // logic as before. we call this on mount and also on a timer so that slots
  // vanish if they are booked while the user is still looking at the page.
  const refreshAvailability = async () => {
    try {
      const r = await fetch('/api/availability');
      const data = await r.json();
      const map = {};

      (data || []).forEach((row) => {
        // only consider slots that are not yet booked (booking_form_id == null)
        if (row.booking_form_id !== null) return;

        const { dateKey, timeKey } = utcToTorontoTime(row.date);

        map[dateKey] = map[dateKey] || [];
        const slot = { admin: row.tech_support_admin_name, time: timeKey };
        if (!map[dateKey].some((s) => s.admin === slot.admin && s.time === slot.time)) {
          map[dateKey].push(slot);
        }
      });

      const dlist = Object.keys(map).sort();
      setAvailabilityMap(map);
      setDates(dlist);
    } catch (err) {
      console.error('failed to refresh availability', err);
    }
  };

  useEffect(() => {
    refreshAvailability();
    const id = setInterval(refreshAvailability, 10000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!selectedDate) return setOptions([]);
    setOptions(availabilityMap[selectedDate] || []);
    setSelectedOption(null);
  }, [selectedDate, availabilityMap]);

  const handleNext = async () => {
    if (!selectedOption) return;

    // double-check availability of the chosen slot just before navigating; if
    // somebody else grabbed it we'll remove it from the list and show a message.
    try {
      const resp = await fetch(
        `/api/availability?tech_support_admin_name=${encodeURIComponent(
          selectedOption.admin
        )}`
      );
      if (resp.ok) {
        const avail = await resp.json();
        const still = avail.some((row) => {
          const { dateKey, timeKey } = utcToTorontoTime(row.date);
          return dateKey === selectedDate && timeKey === selectedOption.time;
        });
        if (!still) {
          alert('Sorry, that slot is no longer available. Please choose another time.');
          // remove it from our local state so it isn't shown again
          setOptions((prev) => prev.filter((o) => !(o.admin === selectedOption.admin && o.time === selectedOption.time)));
          setAvailabilityMap((prev) => {
            const copy = { ...prev };
            if (copy[selectedDate]) {
              copy[selectedDate] = copy[selectedDate].filter((o) => !(o.admin === selectedOption.admin && o.time === selectedOption.time));
            }
            return copy;
          });
          setSelectedOption(null);
          return;
        }
      }
    } catch (err) {
      console.error('availability recheck failed', err);
    }

    navigate('/booking-form', { state: { adminName: selectedOption.admin, date: selectedDate, time: selectedOption.time } });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto font-sans">
      <h2 className="text-xl font-bold mb-4">Test Booking Page</h2>

      {dates.length === 0 ? (
        <div>
          <p>Check back later</p>
        </div>
      ) : (
        <div>
          <div className="mb-4">
            <h3 className="font-medium">Select Date</h3>
            <div className="flex gap-2 mt-2 flex-wrap">
              {dates.map((d) => (
                <button
                  key={d}
                  onClick={() => setSelectedDate(d)}
                  className={`px-3 py-1 border rounded ${selectedDate === d ? 'bg-blue-500 text-white' : ''}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          {selectedDate && (
            <div className="mb-4">
              <h3 className="font-medium">Available Times for {selectedDate}</h3>
              {options.length === 0 ? (
                <p>No times available for this date.</p>
              ) : (
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {options.map((o, i) => (
                    <label key={i} className={`border p-2 rounded cursor-pointer ${selectedOption === o ? 'bg-green-200' : ''}`}>
                      <input
                        type="radio"
                        name="slot"
                        checked={selectedOption === o}
                        onChange={() => setSelectedOption(o)}
                        className="mr-2"
                      />
                      <strong>{o.admin}</strong> — {o.time}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="mt-4">
            <button
              onClick={handleNext}
              disabled={!selectedOption}
              className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
