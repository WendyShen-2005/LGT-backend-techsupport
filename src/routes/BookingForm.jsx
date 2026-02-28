import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Convert UTC ISO timestamp to Toronto local time components.
// Returns { dateKey: "YYYY-MM-DD", timeKey: "H:MM" }
function utcToTorontoTime(isoString) {
  const utcDate = new Date(isoString);

  // Format as Toronto time using Intl API
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
  // Remove leading zero from hour if present (e.g., "08" → "8")
  const hour = parseInt(timeObj.hour, 10);
  const timeKey = `${hour}:${timeObj.minute}`;

  return { dateKey, timeKey };
}

export default function BookingForm() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [slotAvailable, setSlotAvailable] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    issueDescription: '',
    deviceType: '',
    os: '',
    urgencyLevel: 'medium',
    is18: false,
    lgtMember: false,
  });

    // whenever the form loads make sure the slot still exists (it may have been
  // booked by someone else since the user picked it). if it's gone we show a
  // friendly message and keep the submit button disabled.
  useEffect(() => {
    if (!state || !state.adminName) return;

    (async () => {
      try {
        const res = await fetch(
          `/api/availability?tech_support_admin_name=${encodeURIComponent(
            state.adminName
          )}`
        );
        if (!res.ok) throw new Error('could not fetch availability');
        const data = await res.json();
        const exists = data.some((row) => {
          const { dateKey, timeKey } = utcToTorontoTime(row.date);
          return dateKey === state.date && timeKey === state.time;
        });
        if (!exists) {
          setMessage('The selected time slot is no longer available.');
          setSlotAvailable(false);
        }
      } catch (err) {
        console.error('availability check failed', err);
      }
    })();
  }, [state]);


  if (!state || !state.adminName) {
    return (
      <div className="p-6">
        <p>No booking selected. Go back to the test page to choose a slot.</p>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (!slotAvailable) {
      setMessage('Cannot submit – slot no longer available.');
      return;
    }

    if (!formData.name || !formData.email || !formData.phone || !formData.issueDescription) {
      setMessage('Please fill in all required fields.');
      return;
    }

    setLoading(true);
    setMessage('');
    try {
      // reserve the slot and get bookingId
      const res = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminName: state.adminName, date: state.date, time: state.time }),
      });

      const json = await res.json();
      if (!res.ok) {
        // bubble up server error message so we can show it below
        throw new Error(json.error || 'Failed to create booking');
      }

      const bookingId = json.booking.bookingFormId;

      // Now submit the form data with the same booking ID
      const formRes = await fetch('/api/form-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId,
          full_name: formData.name,
          email: formData.email,
          phone_num: formData.phone,
          description: formData.issueDescription,
          device_type: formData.deviceType,
          os: formData.os,
          urgency_level: formData.urgencyLevel,
          is_18: formData.is18,
          lgt_member: formData.lgtMember,
          date: new Date().toISOString(),
        }),
      });

      if (!formRes.ok) {
        throw new Error('Failed to save form data');
      }

      setMessage(`Booking created (id: ${bookingId})`);
      // navigate back to test page after short delay
      setTimeout(() => navigate('/test-booking'), 1200);
    } catch (err) {
      console.error(err);
      // if the server told us the slot is unavailable, show a clearer message
      if (err.message && err.message.toLowerCase().includes('requested time not available')) {
        setMessage('Selected time is no longer available. Please pick another slot.');
      } else {
        setMessage('Failed to create booking. See console.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold mb-4">Tech Support Booking Form</h2>
      <p className="mb-2">Admin: <strong>{state.adminName}</strong></p>
      <p className="mb-2">Date: <strong>{state.date}</strong></p>
      <p className="mb-6">Time: <strong>{state.time}</strong></p>

      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
        {/* Name - Required */}
        <div>
          <label className="block font-semibold mb-2">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            required
            className="w-full border border-gray-300 rounded px-3 py-2"
            placeholder="Full name"
          />
        </div>

        {/* Email - Required */}
        <div>
          <label className="block font-semibold mb-2">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            required
            className="w-full border border-gray-300 rounded px-3 py-2"
            placeholder="your@email.com"
          />
        </div>

        {/* Phone Number - Required */}
        <div>
          <label className="block font-semibold mb-2">
            Phone Number <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            name="phone"
            value={formData.phone}
            onChange={handleInputChange}
            required
            className="w-full border border-gray-300 rounded px-3 py-2"
            placeholder="(123) 456-7890"
          />
        </div>

        {/* Tech Issue Description - Required */}
        <div>
          <label className="block font-semibold mb-2">
            Tech Issue Description <span className="text-red-500">*</span>
          </label>
          <textarea
            name="issueDescription"
            value={formData.issueDescription}
            onChange={handleInputChange}
            required
            className="w-full border border-gray-300 rounded px-3 py-2 h-28"
            placeholder="Describe the technical issue you're experiencing..."
          />
        </div>

        {/* Device Type - Optional */}
        <div>
          <label className="block font-semibold mb-2">
            Device Type (optional)
          </label>
          <select
            name="deviceType"
            value={formData.deviceType}
            onChange={handleInputChange}
            className="w-full border border-gray-300 rounded px-3 py-2"
          >
            <option value="">Select a device type</option>
            <option value="desktop">Desktop</option>
            <option value="laptop">Laptop</option>
            <option value="tablet">Tablet</option>
            <option value="smartphone">Smartphone</option>
            <option value="other">Other</option>
          </select>
        </div>

        {/* Operating System - Optional */}
        <div>
          <label className="block font-semibold mb-2">
            Operating System (optional)
          </label>
          <input
            type="text"
            name="os"
            value={formData.os}
            onChange={handleInputChange}
            className="w-full border border-gray-300 rounded px-3 py-2"
            placeholder="e.g. Windows 11, macOS 13, etc."
          />
        </div>

        {/* Urgency Level - Optional */}
        <div>
          <label className="block font-semibold mb-2">
            Urgency Level (optional)
          </label>
          <select
            name="urgencyLevel"
            value={formData.urgencyLevel}
            onChange={handleInputChange}
            className="w-full border border-gray-300 rounded px-3 py-2"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        {/* Age confirmation & membership */}
        <div className="flex items-center space-x-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              name="is18"
              checked={formData.is18}
              onChange={(e) =>
                setFormData((p) => ({ ...p, is18: e.target.checked }))
              }
              className="mr-2"
            />
            I confirm I am 18 or older
          </label>

          <label className="flex items-center">
            <input
              type="checkbox"
              name="lgtMember"
              checked={formData.lgtMember}
              onChange={(e) =>
                setFormData((p) => ({ ...p, lgtMember: e.target.checked }))
              }
              className="mr-2"
            />
            I am an LGT member
          </label>
        </div>

        <div className="pt-4">
          <button type="submit" disabled={loading} className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-semibold">
            {loading ? 'Submitting...' : 'Submit Booking'}
          </button>
        </div>
      </form>

      {message && <p className="mt-4 text-lg font-semibold">{message}</p>}
    </div>
  );
}
