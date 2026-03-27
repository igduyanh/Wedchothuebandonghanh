package com.hutech.nguyenphucthinh.controller.user;

import com.hutech.nguyenphucthinh.model.Booking;
import com.hutech.nguyenphucthinh.service.user.BookingService;
import com.hutech.nguyenphucthinh.util.RequestBodyParseUtil;

import java.util.Map;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;

@RestController
@RequestMapping("/api/bookings")
public class BookingController {
    @Autowired
    private BookingService bookingService;

    @PostMapping
    public Booking createBooking(@RequestBody Map<String, Object> request, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Vui lòng đăng nhập trước");
        }
        Number companionId = (Number) request.get("companionId");
        Number servicePriceId = (Number) request.get("servicePriceId");
        String bookingTime = (String) request.get("bookingTime");
        Number duration = (Number) request.get("duration");
        String location = (String) request.getOrDefault("location", "");
        String note = (String) request.getOrDefault("note", "");
        String rentalVenue = (String) request.get("rentalVenue");
        if (companionId == null || servicePriceId == null || bookingTime == null || duration == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "companionId, servicePriceId, bookingTime, duration là bắt buộc");
        }
        return bookingService.createBooking(userId, companionId.longValue(), servicePriceId.longValue(), bookingTime, duration.intValue(), rentalVenue, location, note);
    }

    @GetMapping("/me")
    public List<Booking> getMyBookings(HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) {
            throw new RuntimeException("Please login first");
        }
        return bookingService.getBookingsByCustomer(userId);
    }

    @PatchMapping("/me/{bookingId}/cancel")
    public Booking cancelBooking(@PathVariable Long bookingId, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) throw new RuntimeException("Please login first");
        return bookingService.cancelBooking(userId, bookingId);
    }

    @PatchMapping("/me/{bookingId}/check-in")
    public Booking checkIn(
            @PathVariable Long bookingId,
            @RequestBody(required = false) Map<String, Object> body,
            HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) throw new RuntimeException("Please login first");
        Double lat = RequestBodyParseUtil.readDouble(body, "lat");
        Double lng = RequestBodyParseUtil.readDouble(body, "lng");
        return bookingService.checkInCustomer(userId, bookingId, lat, lng);
    }

    @PatchMapping("/me/{bookingId}/check-out")
    public Booking checkOut(
            @PathVariable Long bookingId,
            @RequestBody(required = false) Map<String, Object> body,
            HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) throw new RuntimeException("Please login first");
        Double lat = RequestBodyParseUtil.readDouble(body, "lat");
        Double lng = RequestBodyParseUtil.readDouble(body, "lng");
        return bookingService.checkOutCustomer(userId, bookingId, lat, lng);
    }

    /** Khách xin gia hạn — companion duyệt qua API riêng mới thu cọc thêm. */
    @PostMapping("/me/{bookingId}/extension-request")
    public Booking requestExtension(@PathVariable Long bookingId, @RequestBody Map<String, Object> request, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) throw new RuntimeException("Please login first");
        Number extraMinutes = (Number) request.get("extraMinutes");
        if (extraMinutes == null) throw new RuntimeException("extraMinutes is required");
        return bookingService.requestBookingExtension(userId, bookingId, extraMinutes.intValue());
    }

    @PostMapping("/me/{bookingId}/extension-request/cancel")
    public Booking cancelExtensionRequest(@PathVariable Long bookingId, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) throw new RuntimeException("Please login first");
        return bookingService.cancelBookingExtensionRequest(userId, bookingId);
    }

    @GetMapping("/customer/{customerId}")
    public List<Booking> getCustomerBookings(@PathVariable Long customerId) {
        return bookingService.getBookingsByCustomer(customerId);
    }

    /** Cập nhật vị trí realtime (khách hoặc companion của đơn). */
    @PostMapping("/me/{bookingId}/live-location")
    public Map<String, Object> postLiveLocation(
            @PathVariable Long bookingId,
            @RequestBody Map<String, Object> body,
            HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) {
            throw new RuntimeException("Please login first");
        }
        Double lat = RequestBodyParseUtil.readDouble(body, "lat");
        Double lng = RequestBodyParseUtil.readDouble(body, "lng");
        return bookingService.updateLiveLocation(userId, bookingId, lat, lng);
    }

    @GetMapping("/me/{bookingId}/live-location")
    public Map<String, Object> getLiveLocation(@PathVariable Long bookingId, HttpSession session) {
        Long userId = (Long) session.getAttribute("userId");
        if (userId == null) {
            throw new RuntimeException("Please login first");
        }
        return bookingService.getLiveLocation(userId, bookingId);
    }
}
