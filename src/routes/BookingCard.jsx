import React, { useState, useEffect } from 'react';

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

export default function BookingCard({
  booking,
  isExpanded,
  form,
  onExpandDetails,
  onConfirm,
  onReject,
}) {
  return (
    <div
      className={`border-2 rounded-lg overflow-hidden shadow-md transition ${
        booking.admin_confirmed
          ? 'bg-green-50 border-green-400'
          : 'bg-yellow-50 border-yellow-400'
      }`}
    >
      {/* Header Section */}
      <div
        className={`px-6 py-4 ${booking.admin_confirmed ? 'bg-green-100' : 'bg-yellow-100'} border-b-2 ${booking.admin_confirmed ? 'border-green-300' : 'border-yellow-300'}`}
      >
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <h3 className="text-xl font-bold text-gray-800">
              {booking.tech_support_admin_name}
            </h3>
            <p className="text-lg text-gray-700 mt-1">
              {booking.slot_date
                ? (() => {
                    const { dateKey, timeKey } = utcToTorontoTime(
                      booking.slot_date
                    );
                    return `${dateKey} at ${timeKey} (Toronto)`;
                  })()
                : 'N/A'}
            </p>
            <p className="text-sm text-gray-600 mt-1">ID: {booking.id}</p>
          </div>
          <div className="text-sm font-bold ml-4">
            {booking.admin_confirmed ? (
              <span className="bg-green-500 text-white px-4 py-2 rounded-full">
                ✓ Confirmed
              </span>
            ) : (
              <span className="bg-yellow-500 text-white px-4 py-2 rounded-full">
                Pending
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Meeting Link */}
      {booking.admin_confirmed && booking.google_meet_link && (
        <div className="px-6 py-4 bg-blue-50 border-b-2 border-blue-300">
          <p className="text-sm font-semibold text-gray-700 mb-3">
            Google Meet Link:
          </p>
          <a
            href={booking.google_meet_link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition"
          >
            Join Meeting
          </a>
        </div>
      )}

      {/* Action Buttons */}
      {!booking.admin_confirmed && (
        <div className="px-6 py-3 bg-gray-50 border-b flex gap-2">
          <button
            onClick={() => onConfirm(booking.id)}
            className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded transition"
          >
            ✓ Accept
          </button>

          <button
            onClick={() => onReject(booking.id)}
            className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-4 rounded transition"
          >
            ✕ Reject
          </button>
        </div>
      )}

      {/* Expand Button */}
      <div className="px-6 py-3">
        <button
          onClick={() => onExpandDetails(booking.id)}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded transition"
        >
          {isExpanded ? '▼ Hide Details' : '▶ View Details'}
        </button>
      </div>

      {/* Details Section */}
      {isExpanded && (
        <>
          {form ? (
            <div className="px-6 py-4 bg-white border-t-2 border-gray-300">
              <h3 className="font-bold text-lg text-gray-800 mb-4 pb-3 border-b-2 border-gray-200">
                Customer Information
              </h3>

              <div className="space-y-3 text-gray-700">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="font-semibold text-sm text-gray-600">
                      Name
                    </span>
                    <p className="mt-1">{form.full_name}</p>
                  </div>

                  <div>
                    <span className="font-semibold text-sm text-gray-600">
                      Email
                    </span>
                    <p className="mt-1">{form.email}</p>
                  </div>
                </div>

                <div>
                  <span className="font-semibold text-sm text-gray-600">
                    Phone
                  </span>
                  <p className="mt-1">{form.phone_num || 'Not provided'}</p>
                </div>

                <div>
                  <span className="font-semibold text-sm text-gray-600">
                    Issue Description
                  </span>
                  <p className="mt-1 bg-gray-100 p-3 rounded border-l-4 border-blue-500">
                    {form.description || 'No description'}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-2">
                  <div>
                    <span className="font-semibold text-sm text-gray-600">
                      Urgency
                    </span>
                    <p className="mt-1">{form.urgency_level || '—'}</p>
                  </div>

                  <div>
                    <span className="font-semibold text-sm text-gray-600">
                      Tech Comfort
                    </span>
                    <p className="mt-1">{form.tech_comfort || '—'}</p>
                  </div>

                  <div>
                    <span className="font-semibold text-sm text-gray-600">
                      LGT Member
                    </span>
                    <p className="mt-1">
                      {form.lgt_member ? '✓ Yes' : '✗ No'}
                    </p>
                  </div>
                </div>

                <p className="text-xs text-gray-500 pt-3 border-t border-gray-200">
                  <span className="font-semibold">Submitted:</span>{' '}
                  {new Date(form.date).toLocaleString()}
                </p>
              </div>
            </div>
          ) : (
            <div className="px-6 py-4 bg-gray-100 border-t-2 border-gray-300 text-center text-gray-600 font-semibold">
              Loading form details...
            </div>
          )}
        </>
      )}
    </div>
  );
}
