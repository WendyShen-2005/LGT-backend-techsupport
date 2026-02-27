import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import './index.css';
import reportWebVitals from './reportWebVitals';
import AdminAvailabilityUI from './routes/AdminAvailabilityUI';
import BookingTest from './routes/BookingTest';
import BookingForm from './routes/BookingForm';
import AdminBookingsUI from './routes/AdminBookingsUI';

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    <BrowserRouter>
      <div className="p-4 border-b mb-4">
        <nav className="flex gap-4">
          <Link to="/">Admin Availability</Link>
          <Link to="/bookings">Booking Requests</Link>
          <Link to="/test-booking">Test Booking</Link>
        </nav>
      </div>

      <Routes>
        <Route path="/" element={<AdminAvailabilityUI />} />
        <Route path="/bookings" element={<AdminBookingsUI />} />
        <Route path="/test-booking" element={<BookingTest />} />
        <Route path="/booking-form" element={<BookingForm />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);

reportWebVitals();
