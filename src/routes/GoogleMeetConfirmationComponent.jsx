import React, { useState, useEffect } from 'react';

const GoogleMeetConfirmationComponent = ({setGoogleMeetLink, setConfirmingBookingId, googleMeetLink, confirmLoading, handleConfirmWithLink}) => {
    return (
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
      )
}

export default GoogleMeetConfirmationComponent;