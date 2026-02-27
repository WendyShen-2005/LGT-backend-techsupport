import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function BookingForm() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    issueDescription: '',
    deviceType: '',
    urgencyLevel: 'medium',
  });

  if (!state || !state.adminName) {
    return (
      <div className="p-6">
        <p>No booking selected. Go back to the test page to choose a slot.</p>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (!formData.name || !formData.email || !formData.phone || !formData.issueDescription) {
      setMessage('Please fill in all required fields.');
      return;
    }

    setLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminName: state.adminName, date: state.date, time: state.time }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to create booking');
      }

      const bookingId = json.booking.bookingFormId;

      // Now submit the form data with the same booking ID
      const formRes = await fetch('/api/form-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId,
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          issueDescription: formData.issueDescription,
          deviceType: formData.deviceType,
          urgencyLevel: formData.urgencyLevel,
          submittedAt: new Date().toISOString(),
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
      setMessage('Failed to create booking. See console.');
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
