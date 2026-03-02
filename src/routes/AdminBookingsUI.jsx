import React, { useState, useEffect } from 'react';
import BookingCard from './BookingCard';

export default function AdminBookingsUI() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedBookingId, setExpandedBookingId] = useState(null);
  const [formDetails, setFormDetails] = useState({});
  const [filter, setFilter] = useState('all'); 
  // 'all' | 'confirmed' | 'unconfirmed'
  const [confirmingBookingId, setConfirmingBookingId] = useState(null);
  const [googleMeetLink, setGoogleMeetLink] = useState('');
  const [confirmLoading, setConfirmLoading] = useState(false);

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/bookings');
      if (!response.ok) throw new Error('Failed to fetch bookings');
      const data = await response.json();
      setBookings(data);
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching bookings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = (bookingId) => {
    // Open the modal to ask for Google Meet link
    setConfirmingBookingId(bookingId);
    setGoogleMeetLink('');
  };

  const handleConfirmWithLink = async () => {
    if (!googleMeetLink.trim()) {
      setError('Google Meet link is required to confirm the booking');
      return;
    }

    try {
      setConfirmLoading(true);
      const response = await fetch(`/api/bookings/${confirmingBookingId}/confirm`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ google_meet_link: googleMeetLink.trim() }),
      });

      if (!response.ok) throw new Error('Failed to confirm booking');

      // Update local state immediately with correct field names
      setBookings((prevBookings) =>
        prevBookings.map((b) =>
          b.id === confirmingBookingId ? { ...b, admin_confirmed: true } : b
        )
      );

      // Close modal
      setConfirmingBookingId(null);
      setGoogleMeetLink('');
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error('Error confirming booking:', err);
      fetchBookings(); // Refresh to ensure consistency
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleReject = async (bookingId) => {
    try {
      const response = await fetch(`/api/bookings/${bookingId}/reject`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) throw new Error('Failed to reject booking');

      // Remove from local state
      setBookings((prevBookings) => prevBookings.filter((b) => b.id !== bookingId));
    } catch (err) {
      setError(err.message);
      console.error('Error rejecting booking:', err);
      fetchBookings(); // Refresh to ensure consistency
    }
  };

  const handleExpandDetails = async (bookingId) => {
    if (expandedBookingId === bookingId) {
      // Collapse if already expanded
      setExpandedBookingId(null);
      return;
    }

    // Fetch form details
    try {
      const response = await fetch(`/api/form/${bookingId}`);
      if (!response.ok) {
        setError('No form data found for this booking');
        return;
      }

      const form = await response.json();
      setFormDetails((prev) => ({
        ...prev,
        [bookingId]: form,
      }));
      setExpandedBookingId(bookingId);
    } catch (err) {
      setError('Failed to fetch form details');
      console.error('Error fetching form details:', err);
    }
  };

  if (loading) {
    return <div className="p-4">Loading bookings...</div>;
  }

  const filteredBookings = bookings.filter((booking) => {
    if (filter === 'confirmed') return booking.admin_confirmed;
    if (filter === 'unconfirmed') return !booking.admin_confirmed;
    return true;
  });

  return (
    <div className="p-6 max-w-6xl mx-auto bg-gradient-to-br from-gray-50 to-gray-100 min-h-screen">
      <h1 className="text-4xl font-bold mb-6 text-gray-800">Booking Dashboard</h1>

      <div className="flex gap-3 mb-6">
        <button
          onClick={() => setFilter('all')}
          className={`px-6 py-3 rounded-lg font-bold transition ${
            filter === 'all'
              ? 'bg-blue-600 text-white shadow-lg'
              : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
          }`}
        >
          All Bookings
        </button>

        <button
          onClick={() => setFilter('confirmed')}
          className={`px-6 py-3 rounded-lg font-bold transition ${
            filter === 'confirmed'
              ? 'bg-green-600 text-white shadow-lg'
              : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
          }`}
        >
          ✓ Confirmed
        </button>

        <button
          onClick={() => setFilter('unconfirmed')}
          className={`px-6 py-3 rounded-lg font-bold transition ${
            filter === 'unconfirmed'
              ? 'bg-yellow-600 text-white shadow-lg'
              : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300'
          }`}
        >
          ⏳ Pending
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border-2 border-red-400 text-red-700 px-6 py-4 rounded-lg mb-6 font-semibold">
          {error}
        </div>
      )}

      {bookings.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <p className="text-gray-600 text-lg">No booking requests at this time.</p>
        </div>
      ) : (
        <div className="space-y-4">
            {filteredBookings.map((booking) => (
              <div style={{border:"1px solid black", borderRadius:"5px", padding:"10px", margin:"20px 0"}}>
              <BookingCard
                key={booking.id}
                booking={booking}
                isExpanded={expandedBookingId === booking.id}
                form={formDetails[booking.id]}
                onExpandDetails={handleExpandDetails}
                onConfirm={handleConfirm}
                onReject={handleReject}
              />

              {/* Google Meet Link Confirmation Modal */}
      {confirmingBookingId == booking.id && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full">
            <h2 className="text-2xl font-bold mb-6 text-gray-800">Confirm Booking</h2>

            <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-900 leading-relaxed">
                <span className="font-bold">Important:</span> When creating the Google Meet link, make sure to <span className="font-bold">invite the user</span> to the meeting. This sends them a calendar notification with the meeting details.
              </p>
            </div>

            <label className="block font-semibold text-gray-800 mb-3 text-base">
              Google Meet Link:
            </label>
            <input
              type="url"
              placeholder="https://meet.google.com/abc-defg-hij"
              value={googleMeetLink}
              onChange={(e) => setGoogleMeetLink(e.target.value)}
              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 text-base"
            />

            <div className="flex gap-3 mt-8">
              <button
                onClick={() => {
                  setConfirmingBookingId(null);
                  setGoogleMeetLink('');
                }}
                className="flex-1 bg-gray-400 hover:bg-gray-500 text-white font-bold py-3 px-4 rounded-lg transition"
                disabled={confirmLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmWithLink}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition disabled:bg-gray-400"
                disabled={confirmLoading || !googleMeetLink.trim()}
              >
                {confirmLoading ? '⏳ Confirming...' : '✓ Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

              </div>
            ))}

      <button
        onClick={fetchBookings}
        className="mt-6 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg shadow transition"
      >
        🔄 Refresh Bookings
      </button>

      
    </div>
  )}
  </div>
)
}
