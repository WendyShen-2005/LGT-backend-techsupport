import React, { useState, useEffect } from 'react';

export default function AdminBookingsUI() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedBookingId, setExpandedBookingId] = useState(null);
  const [formDetails, setFormDetails] = useState({});
  const [filter, setFilter] = useState('all'); 
  // 'all' | 'confirmed' | 'unconfirmed'

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

  const handleConfirm = async (bookingId) => {
    try {
      const response = await fetch(`/api/bookings/${bookingId}/confirm`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) throw new Error('Failed to confirm booking');

      // Update local state
      setBookings((prevBookings) =>
        prevBookings.map((b) =>
          b.id === bookingId ? { ...b, adminConfirmed: true } : b
        )
      );
    } catch (err) {
      setError(err.message);
      console.error('Error confirming booking:', err);
      fetchBookings(); // Refresh to ensure consistency
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
    if (filter === 'confirmed') return booking.adminConfirmed;
    if (filter === 'unconfirmed') return !booking.adminConfirmed;
    return true;
  });

  return (
    <div className="p-4">
      <div className="flex gap-2 mb-4">
      <button
        onClick={() => setFilter('all')}
        className={`px-4 py-2 rounded font-semibold ${
          filter === 'all'
            ? 'bg-blue-600 text-white'
            : 'bg-gray-200 hover:bg-gray-300'
        }`}
      >
        All
      </button>

      <button
        onClick={() => setFilter('confirmed')}
        className={`px-4 py-2 rounded font-semibold ${
          filter === 'confirmed'
            ? 'bg-green-600 text-white'
            : 'bg-gray-200 hover:bg-gray-300'
        }`}
      >
        Confirmed
      </button>

      <button
        onClick={() => setFilter('unconfirmed')}
        className={`px-4 py-2 rounded font-semibold ${
          filter === 'unconfirmed'
            ? 'bg-yellow-600 text-white'
            : 'bg-gray-200 hover:bg-gray-300'
        }`}
      >
        Unconfirmed
      </button>
</div>
      <h1 className="text-2xl font-bold mb-4">Booking Requests</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {bookings.length === 0 ? (
        <p className="text-gray-600">No booking requests at this time.</p>
      ) : (
        <div className="space-y-3">
          {filteredBookings.map((booking) => (            
            <div
              key={booking.id}
              className={`border rounded-lg p-4 ${
                booking.adminConfirmed
                  ? 'bg-green-50 border-green-300'
                  : 'bg-yellow-50 border-yellow-300'
              }`}
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <p className="font-semibold text-lg">Admin: {booking.adminName}</p>
                  <p className="text-gray-600">
                    Date: {booking.date} at {booking.time}
                  </p>
                  <p className="text-sm text-gray-500">
                    Requested: {new Date(booking.createdAt).toLocaleDateString()}
                  </p>
                  <p className="text-sm text-gray-500">
                    Booking ID: {booking.id}
                  </p>
                </div>
                <div className="text-sm font-medium">
                  {booking.adminConfirmed ? (
                    <span className="bg-green-200 text-green-800 px-3 py-1 rounded">
                      ✓ Confirmed
                    </span>
                  ) : (
                    <span className="bg-yellow-200 text-yellow-800 px-3 py-1 rounded">
                      Pending
                    </span>
                  )}
                </div>
              </div>

              {!booking.adminConfirmed && (
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => handleConfirm(booking.id)}
                    className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleReject(booking.id)}
                    className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded"
                  >
                    Reject
                  </button>
                </div>
              )}

              <button
                onClick={() => handleExpandDetails(booking.id)}
                className="mt-3 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
              >
                {expandedBookingId === booking.id ? 'Hide Details' : 'Expand Details'}
              </button>

              {expandedBookingId === booking.id && formDetails[booking.id] && (
                <div className="mt-4 bg-white border border-blue-200 rounded p-4">
                  <h3 className="font-bold text-lg mb-3">Form Details</h3>
                  <div className="space-y-2 text-sm">
                    <p><span className="font-semibold">Name:</span> {formDetails[booking.id].name}</p>
                    <p><span className="font-semibold">Email:</span> {formDetails[booking.id].email}</p>
                    <p><span className="font-semibold">Phone:</span> {formDetails[booking.id].phone}</p>
                    <div>
                      <span className="font-semibold">Issue Description:</span>
                      <p className="mt-1 bg-gray-50 p-2 rounded">{formDetails[booking.id].issueDescription}</p>
                    </div>
                    {formDetails[booking.id].deviceType && (
                      <p><span className="font-semibold">Device Type:</span> {formDetails[booking.id].deviceType}</p>
                    )}
                    <p><span className="font-semibold">Urgency Level:</span> {formDetails[booking.id].urgencyLevel}</p>
                    <p className="text-gray-500"><span className="font-semibold">Submitted:</span> {new Date(formDetails[booking.id].submittedAt).toLocaleString()}</p>
                  </div>
                </div>
              )}

              {expandedBookingId === booking.id && !formDetails[booking.id] && (
                <div className="mt-4 bg-gray-100 border border-gray-300 rounded p-4 text-gray-600">
                  Loading form details...
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={fetchBookings}
        className="mt-4 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
      >
        Refresh
      </button>
    </div>
  );
}
