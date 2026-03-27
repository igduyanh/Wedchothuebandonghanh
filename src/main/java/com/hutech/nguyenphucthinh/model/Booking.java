package com.hutech.nguyenphucthinh.model;

import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "bookings")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class Booking {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "customer_id", nullable = false)
    private User customer;

    @ManyToOne
    @JoinColumn(name = "companion_id", nullable = false)
    private Companion companion;

    @Column(nullable = false)
    private LocalDateTime bookingTime;

    @Column(nullable = false)
    private Integer duration; // in minutes

    @Column(length = 255)
    private String location;

    /** Giá trị đã chọn từ danh sách nơi thuê của companion. */
    @Column(length = 500)
    private String rentalVenue;

    @Column(length = 120)
    private String serviceName;

    private BigDecimal servicePricePerHour;

    @Column(columnDefinition = "TEXT")
    private String note;

    @Column(nullable = false)
    private BigDecimal holdAmount = BigDecimal.ZERO;

    @Enumerated(EnumType.STRING)
    @Column(length = 20)
    private Status status = Status.PENDING;

    private LocalDateTime acceptedAt;

    private LocalDateTime startedAt;

    private LocalDateTime completedAt;

    private LocalDateTime cancelledAt;

    private Double checkInLatitude;

    private Double checkInLongitude;

    /** GPS lúc check-in của khách (chờ companion check-in gần mới vào IN_PROGRESS). */
    private Double customerCheckInLatitude;

    private Double customerCheckInLongitude;

    private Double companionCheckInLatitude;

    private Double companionCheckInLongitude;

    private Double checkOutLatitude;

    private Double checkOutLongitude;

    /** GPS check-out khách — đơn COMPLETED khi companion cũng check-out và hai điểm trong bán kính cấu hình. */
    private Double customerCheckOutLatitude;

    private Double customerCheckOutLongitude;

    private Double companionCheckOutLatitude;

    private Double companionCheckOutLongitude;

    /** Vị trí chia sẻ realtime (đơn ACCEPTED / IN_PROGRESS), cập nhật định kỳ từ app. */
    private Double liveLatitude;

    private Double liveLongitude;

    private LocalDateTime liveLocationAt;

    /** CUSTOMER hoặc COMPANION — ai gửi bản tin vị trí gần nhất. */
    @Column(length = 20)
    private String liveLocationRole;

    private Boolean sosTriggered = false;

    @Column(columnDefinition = "TEXT")
    private String sosNote;

    private Integer companionRatingForUser;

    @Column(columnDefinition = "TEXT")
    private String companionReviewForUser;

    private LocalDateTime createdAt = LocalDateTime.now();

    /** Tổng số phút đã gia hạn được companion duyệt (tối đa theo cấu hình, vd 120). */
    private Integer extensionMinutesApproved;

    /** Khách xin gia hạn thêm bấy nhiêu phút — chờ companion duyệt mới thu cọc. */
    private Integer pendingExtensionMinutes;

    private LocalDateTime pendingExtensionRequestedAt;

    public enum Status {
        PENDING, ACCEPTED, REJECTED, IN_PROGRESS, COMPLETED, CANCELLED
    }
}
