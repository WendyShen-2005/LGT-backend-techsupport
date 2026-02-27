import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function BookingTest() {
  const [availabilityMap, setAvailabilityMap] = useState({});
  const [dates, setDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [options, setOptions] = useState([]);
  const [selectedOption, setSelectedOption] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/availability')
      .then((r) => r.json())
      .then((data) => {
        // build date -> [{ admin, time }, ...]
        const map = {};
        Object.entries(data || {}).forEach(([admin, datesObj]) => {
          Object.entries(datesObj || {}).forEach(([date, timesArr]) => {
            map[date] = map[date] || [];
            (timesArr || []).forEach((t) => map[date].push({ admin, time: t }));
          });
        });

        const dlist = Object.keys(map).sort();
        setAvailabilityMap(map);
        setDates(dlist);
      })
      .catch((err) => console.error(err));
  }, []);

  useEffect(() => {
    if (!selectedDate) return setOptions([]);
    setOptions(availabilityMap[selectedDate] || []);
    setSelectedOption(null);
  }, [selectedDate, availabilityMap]);

  const handleNext = () => {
    if (!selectedOption) return;
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
