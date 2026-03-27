package com.hutech.nguyenphucthinh.repository;

import com.hutech.nguyenphucthinh.model.Booking;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface BookingRepository extends JpaRepository<Booking, Long> {
    List<Booking> findByCustomerIdOrderByBookingTimeDesc(Long customerId);
    List<Booking> findByCompanionIdOrderByBookingTimeDesc(Long companionId);
    List<Booking> findByCompanionIdAndStatusOrderByBookingTimeDesc(Long companionId, Booking.Status status);
    long countByCompanionIdAndStatus(Long companionId, Booking.Status status);

    List<Booking> findByStatusInOrderByBookingTimeDesc(Collection<Booking.Status> statuses);

    long countByCustomerIdAndStatusAndCancelledAtAfter(Long customerId, Booking.Status status, java.time.LocalDateTime time);
}
