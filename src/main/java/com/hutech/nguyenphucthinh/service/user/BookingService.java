package com.hutech.nguyenphucthinh.service.user;

import com.hutech.nguyenphucthinh.model.Booking;
import com.hutech.nguyenphucthinh.model.Companion;
import com.hutech.nguyenphucthinh.model.ServicePrice;
import com.hutech.nguyenphucthinh.model.Transaction;
import com.hutech.nguyenphucthinh.model.User;
import com.hutech.nguyenphucthinh.repository.BookingRepository;
import com.hutech.nguyenphucthinh.repository.CompanionRepository;
import com.hutech.nguyenphucthinh.repository.ServicePriceRepository;
import com.hutech.nguyenphucthinh.repository.TransactionRepository;
import com.hutech.nguyenphucthinh.realtime.RealtimeBroadcastService;
import com.hutech.nguyenphucthinh.repository.UserRepository;
import com.hutech.nguyenphucthinh.util.GeoDistanceUtil;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.annotation.Transactional;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static com.hutech.nguyenphucthinh.util.RentalVenuesUtil.parse;

@Service
public class BookingService {
    @Autowired
    private BookingRepository bookingRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private CompanionRepository companionRepository;
    @Autowired
    private ServicePriceRepository servicePriceRepository;
    @Autowired
    private TransactionRepository transactionRepository;
    @Autowired
    private WalletService walletService;
    @Autowired
    private NotificationService notificationService;
    @Autowired
    private RealtimeBroadcastService realtimeBroadcastService;

    @PersistenceContext
    private EntityManager entityManager;

    @Value("${booking.checkin.max-distance-meters:200}")
    private int checkInMaxDistanceMeters;

    @Value("${booking.extension.max-minutes:120}")
    private int maxExtensionMinutesTotal;

    private BigDecimal calculateHoldAmount(BigDecimal pricePerHour, Integer duration) {
        if (pricePerHour == null) pricePerHour = new BigDecimal("200000");

        // duration in minutes, pricePerHour is for 60 minutes
        BigDecimal durationInHours = BigDecimal.valueOf(duration).divide(BigDecimal.valueOf(60), 2, RoundingMode.HALF_UP);
        return pricePerHour.multiply(durationInHours).setScale(0, RoundingMode.HALF_UP);
    }

    private boolean isActiveStatus(Booking.Status status) {
        return status == Booking.Status.PENDING
                || status == Booking.Status.ACCEPTED
                || status == Booking.Status.IN_PROGRESS;
    }

    private boolean overlaps(LocalDateTime startA, Integer durationA, LocalDateTime startB, Integer durationB) {
        LocalDateTime endA = startA.plusMinutes(durationA == null ? 0 : durationA);
        LocalDateTime endB = startB.plusMinutes(durationB == null ? 0 : durationB);
        return startA.isBefore(endB) && startB.isBefore(endA);
    }

    public Booking createBooking(Long customerId, Long companionId, Long servicePriceId, String bookingTime, Integer duration, String rentalVenue, String location, String note) {
        User customer = userRepository.findById(customerId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy khách hàng"));
        Companion companion = companionRepository.findById(companionId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy companion"));
        ServicePrice servicePrice = servicePriceRepository.findByIdAndCompanionId(servicePriceId, companionId)
                .orElseThrow(() -> new RuntimeException("Dịch vụ không hợp lệ hoặc không thuộc companion đã chọn"));
        if (servicePrice.getPricePerHour() == null || servicePrice.getPricePerHour().compareTo(BigDecimal.ZERO) <= 0) {
            throw new RuntimeException("Giá dịch vụ không hợp lệ");
        }
        if (!Boolean.TRUE.equals(companion.getOnlineStatus())) {
            throw new RuntimeException("Companion đang offline, chưa thể đặt lịch");
        }
        if (duration == null || duration < 30) {
            throw new RuntimeException("Thời lượng tối thiểu là 30 phút");
        }
        LocalDateTime bookingStart = LocalDateTime.parse(bookingTime);
        // Không còn chặn đặt lịch trước 2 giờ.
        // Vẫn chặn các booking rơi vào quá khứ để tránh lỗi nghiệp vụ.
        if (bookingStart.isBefore(LocalDateTime.now())) {
            throw new RuntimeException("Bạn phải đặt lịch trong tương lai");
        }

        boolean customerHasActiveBooking = bookingRepository.findByCustomerIdOrderByBookingTimeDesc(customerId)
                .stream()
                .anyMatch(b -> isActiveStatus(b.getStatus()));
        if (customerHasActiveBooking) {
            throw new RuntimeException("Bạn đang có đơn chưa hoàn tất. Vui lòng kết thúc hoặc hủy đơn hiện tại trước khi đặt đơn mới");
        }

        boolean companionBusyInTimeSlot = bookingRepository.findByCompanionIdOrderByBookingTimeDesc(companionId)
                .stream()
                .filter(b -> isActiveStatus(b.getStatus()))
                .anyMatch(b -> overlaps(bookingStart, duration, b.getBookingTime(), b.getDuration()));
        if (companionBusyInTimeSlot) {
            throw new RuntimeException("Companion đã có yêu cầu khác trong cùng khung giờ. Vui lòng chọn thời gian khác");
        }

        List<String> allowedVenues = parse(companion.getRentalVenues());
        if (allowedVenues.isEmpty()) {
            throw new RuntimeException("Companion chưa cấu hình danh sách nơi thuê trong hồ sơ. Vui lòng chọn companion khác hoặc nhắc companion cập nhật hồ sơ.");
        }
        String chosenVenue = rentalVenue == null ? "" : rentalVenue.trim();
        if (chosenVenue.isEmpty() || !allowedVenues.contains(chosenVenue)) {
            throw new RuntimeException("Vui lòng chọn một nơi thuê hợp lệ từ danh sách companion cung cấp.");
        }

        Booking booking = new Booking();
        booking.setCustomer(customer);
        booking.setCompanion(companion);
        booking.setBookingTime(bookingStart);
        booking.setDuration(duration);
        booking.setRentalVenue(chosenVenue);
        booking.setLocation(location);
        booking.setServiceName(servicePrice.getServiceName());
        booking.setServicePricePerHour(servicePrice.getPricePerHour());
        booking.setNote(note);
        booking.setHoldAmount(calculateHoldAmount(servicePrice.getPricePerHour(), duration));
        booking.setExtensionMinutesApproved(0);
        booking.setStatus(Booking.Status.PENDING);
        Booking saved = bookingRepository.save(booking);
        walletService.holdForBooking(customer, saved, saved.getHoldAmount());
        notificationService.create(
                companion.getUser().getId(),
                "Có đơn đặt lịch mới",
                "Khách hàng " + (customer.getUsername() == null ? ("#" + customer.getId()) : customer.getUsername())
                        + " vừa đặt đơn #" + saved.getId() + ". Vui lòng kiểm tra và phản hồi."
        );
        return saved;
    }

    public List<Booking> getBookingsByCustomer(Long customerId) {
        return bookingRepository.findByCustomerIdOrderByBookingTimeDesc(customerId);
    }

    public Booking cancelBooking(Long customerId, Long bookingId) {
        Booking booking = bookingRepository.findById(bookingId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy đơn đặt lịch"));
        if (!booking.getCustomer().getId().equals(customerId)) {
            throw new RuntimeException("Bạn không có quyền hủy đơn này");
        }
        if (booking.getStatus() == Booking.Status.COMPLETED || booking.getStatus() == Booking.Status.CANCELLED) {
            throw new RuntimeException("Đơn đặt lịch không thể hủy");
        }
        if (booking.getStatus() == Booking.Status.IN_PROGRESS) {
            throw new RuntimeException("Booking đang diễn ra, không thể hủy");
        }
        booking.setPendingExtensionMinutes(null);
        booking.setPendingExtensionRequestedAt(null);
        if (booking.getStatus() == Booking.Status.PENDING || booking.getStatus() == Booking.Status.ACCEPTED) {
            BigDecimal refundAmount = calculateRefundAmount(booking);
            if (refundAmount.compareTo(BigDecimal.ZERO) > 0) {
                walletService.refundForBooking(booking.getCustomer(), booking, refundAmount);
            }
        }
        booking.setStatus(Booking.Status.CANCELLED);
        notificationService.create(
                booking.getCustomer().getId(),
                "Booking đã hủy",
                "Đơn #" + booking.getId() + " đã được hủy theo chính sách hoàn tiền."
        );
        return bookingRepository.save(booking);
    }

    private BigDecimal calculateRefundAmount(Booking booking) {
        long minutesBeforeStart = Duration.between(LocalDateTime.now(), booking.getBookingTime()).toMinutes();
        BigDecimal ratio;
        if (minutesBeforeStart >= 1440) ratio = BigDecimal.ONE; // >=24h: 100%
        else if (minutesBeforeStart >= 360) ratio = new BigDecimal("0.50"); // 6h-24h: 50%
        else ratio = BigDecimal.ZERO; // <6h: 0%
        return booking.getHoldAmount().multiply(ratio).setScale(0, RoundingMode.DOWN);
    }

    private static void requireValidGps(Double lat, Double lng) {
        if (lat == null || lng == null || Double.isNaN(lat) || Double.isNaN(lng)) {
            throw new RuntimeException("Cần gửi tọa độ GPS (lat, lng) để check-in.");
        }
        if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
            throw new RuntimeException("Tọa độ GPS không hợp lệ.");
        }
    }

    private static LocalDateTime now() {
        return LocalDateTime.now();
    }

    /**
     * Khách gửi GPS check-in. Chỉ chuyển IN_PROGRESS khi companion đã check-in và hai điểm trong bán kính cấu hình.
     */
    @Transactional
    public Booking checkInCustomer(Long customerId, Long bookingId, Double lat, Double lng) {
        Booking booking = bookingRepository.findById(bookingId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy đơn đặt lịch"));
        if (!booking.getCustomer().getId().equals(customerId)) {
            throw new RuntimeException("Bạn không có quyền check-in đơn này");
        }
        if (booking.getStatus() != Booking.Status.ACCEPTED) {
            throw new RuntimeException("Đơn phải ở trạng thái ACCEPTED trước khi check-in GPS");
        }
        if (now().isBefore(booking.getBookingTime())) {
            throw new RuntimeException("Chưa tới giờ hẹn. Bạn chỉ được check-in từ thời gian booking.");
        }
        requireValidGps(lat, lng);
        booking.setCustomerCheckInLatitude(lat);
        booking.setCustomerCheckInLongitude(lng);
        tryFinishGpsCheckIn(booking);
        return bookingRepository.save(booking);
    }

    /** Companion (theo userId đăng nhập) gửi GPS check-in — cùng quy tắc khoảng cách với khách. */
    @Transactional
    public Booking checkInCompanion(Long companionUserId, Long bookingId, Double lat, Double lng) {
        Booking booking = bookingRepository.findById(bookingId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy đơn đặt lịch"));
        if (!booking.getCompanion().getUser().getId().equals(companionUserId)) {
            throw new RuntimeException("Bạn không có quyền thực hiện thao tác này");
        }
        if (booking.getStatus() != Booking.Status.ACCEPTED) {
            throw new RuntimeException("Đơn không ở trạng thái ACCEPTED");
        }
        if (now().isBefore(booking.getBookingTime())) {
            throw new RuntimeException("Chưa tới giờ hẹn. Bạn chỉ được check-in từ thời gian booking.");
        }
        requireValidGps(lat, lng);
        booking.setCompanionCheckInLatitude(lat);
        booking.setCompanionCheckInLongitude(lng);
        tryFinishGpsCheckIn(booking);
        return bookingRepository.save(booking);
    }

    private void tryFinishGpsCheckIn(Booking booking) {
        Double cLat = booking.getCustomerCheckInLatitude();
        Double cLng = booking.getCustomerCheckInLongitude();
        Double pLat = booking.getCompanionCheckInLatitude();
        Double pLng = booking.getCompanionCheckInLongitude();
        if (cLat == null || cLng == null || pLat == null || pLng == null) {
            return;
        }
        double meters = GeoDistanceUtil.metersBetween(cLat, cLng, pLat, pLng);
        if (meters > checkInMaxDistanceMeters) {
            throw new RuntimeException(String.format(
                    "Hai vị trí check-in cách nhau khoảng %d m (giới hạn %d m). Vui lòng đến cùng điểm hẹn rồi thử lại.",
                    Math.round(meters),
                    checkInMaxDistanceMeters));
        }
        booking.setStartedAt(LocalDateTime.now());
        booking.setStatus(Booking.Status.IN_PROGRESS);
        booking.setCheckInLatitude((cLat + pLat) / 2.0);
        booking.setCheckInLongitude((cLng + pLng) / 2.0);
    }

    /**
     * Khách gửi GPS check-out. Đơn chỉ COMPLETED khi companion cũng check-out và hai điểm trong bán kính (cùng quy tắc check-in).
     */
    @Transactional
    public Booking checkOutCustomer(Long customerId, Long bookingId, Double lat, Double lng) {
        Booking booking = bookingRepository.findById(bookingId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy đơn đặt lịch"));
        if (!booking.getCustomer().getId().equals(customerId)) {
            throw new RuntimeException("Bạn không có quyền check-out đơn này");
        }
        if (booking.getStatus() != Booking.Status.IN_PROGRESS) {
            throw new RuntimeException("Đơn phải ở trạng thái IN_PROGRESS trước khi check-out");
        }
        if (booking.getCustomerCheckOutLatitude() != null) {
            throw new RuntimeException("Bạn đã gửi check-out GPS cho đơn này");
        }
        requireValidGps(lat, lng);
        booking.setCustomerCheckOutLatitude(lat);
        booking.setCustomerCheckOutLongitude(lng);
        if (booking.getCompanionCheckOutLatitude() == null) {
            Booking saved = bookingRepository.save(booking);
            notifyPartnerCheckoutPending(saved, "CUSTOMER");
            return saved;
        }
        validateCheckoutDistance(booking);
        finalizeCheckout(booking);
        return bookingRepository.save(booking);
    }

    /** Companion gửi GPS check-out — cùng quy tắc với khách. */
    @Transactional
    public Booking checkOutCompanion(Long companionUserId, Long bookingId, Double lat, Double lng) {
        Booking booking = bookingRepository.findById(bookingId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy đơn đặt lịch"));
        if (!booking.getCompanion().getUser().getId().equals(companionUserId)) {
            throw new RuntimeException("Bạn không có quyền thực hiện thao tác này");
        }
        if (booking.getStatus() != Booking.Status.IN_PROGRESS) {
            throw new RuntimeException("Đơn không ở trạng thái IN_PROGRESS");
        }
        if (booking.getCompanionCheckOutLatitude() != null) {
            throw new RuntimeException("Bạn đã gửi check-out GPS cho đơn này");
        }
        requireValidGps(lat, lng);
        booking.setCompanionCheckOutLatitude(lat);
        booking.setCompanionCheckOutLongitude(lng);
        if (booking.getCustomerCheckOutLatitude() == null) {
            Booking saved = bookingRepository.save(booking);
            notifyPartnerCheckoutPending(saved, "COMPANION");
            return saved;
        }
        validateCheckoutDistance(booking);
        finalizeCheckout(booking);
        return bookingRepository.save(booking);
    }

    private void validateCheckoutDistance(Booking booking) {
        double meters = GeoDistanceUtil.metersBetween(
                booking.getCustomerCheckOutLatitude(),
                booking.getCustomerCheckOutLongitude(),
                booking.getCompanionCheckOutLatitude(),
                booking.getCompanionCheckOutLongitude());
        if (meters > checkInMaxDistanceMeters) {
            throw new RuntimeException(String.format(
                    "Hai vị trí check-out cách nhau khoảng %d m (giới hạn %d m). Vui lòng đến cùng điểm hẹn rồi thử lại.",
                    Math.round(meters),
                    checkInMaxDistanceMeters));
        }
    }

    private void notifyPartnerCheckoutPending(Booking booking, String finishedRole) {
        if ("CUSTOMER".equals(finishedRole)) {
            notificationService.create(
                    booking.getCompanion().getUser().getId(),
                    "Khách đã check-out GPS",
                    "Đơn #" + booking.getId() + ": khách đã gửi check-out. Vui lòng bạn check-out GPS để kết thúc đơn."
            );
        } else {
            notificationService.create(
                    booking.getCustomer().getId(),
                    "Companion đã check-out GPS",
                    "Đơn #" + booking.getId() + ": companion đã gửi check-out. Vui lòng bạn check-out GPS để kết thúc đơn."
            );
        }
    }

    private void finalizeCheckout(Booking booking) {
        clearLiveLocationFields(booking);
        booking.setCompletedAt(LocalDateTime.now());
        booking.setCheckOutLatitude((booking.getCustomerCheckOutLatitude() + booking.getCompanionCheckOutLatitude()) / 2.0);
        booking.setCheckOutLongitude((booking.getCustomerCheckOutLongitude() + booking.getCompanionCheckOutLongitude()) / 2.0);
        booking.setStatus(Booking.Status.COMPLETED);

        // Idempotent against concurrent check-out requests:
        // transactions.booking_id is effectively UNIQUE, so we must prevent charge/notify duplication.
        if (booking.getId() != null && transactionRepository.findByBookingId(booking.getId()).isPresent()) {
            return;
        }

        Transaction tx = new Transaction();
        tx.setBooking(booking);
        tx.setAmount(booking.getHoldAmount());
        tx.setStatus(Transaction.Status.COMPLETED);

        try {
            // Flush ngay để exception unique xảy ra trong try/catch (tránh rollback-only ở commit).
            transactionRepository.saveAndFlush(tx);
        } catch (DataIntegrityViolationException ex) {
            // Another concurrent request already created the transaction for this booking.
            entityManager.clear();
            return;
        }

        walletService.chargeForBooking(booking.getCustomer(), booking, booking.getHoldAmount());
        notificationService.create(
                booking.getCustomer().getId(),
                "Booking hoàn tất",
                "Đơn #" + booking.getId() + " đã kết thúc. Bạn có thể để lại đánh giá."
        );
        notificationService.create(
                booking.getCompanion().getUser().getId(),
                "Booking hoàn tất",
                "Đơn #" + booking.getId() + " đã kết thúc (cả hai bên đã check-out GPS)."
        );
    }

    private int extensionApprovedSafe(Booking booking) {
        Integer v = booking.getExtensionMinutesApproved();
        return v == null ? 0 : v;
    }

    /** Khách xin gia hạn — companion phải chấp nhận mới giữ thêm tiền. Tổng gia hạn không vượt quá maxExtensionMinutesTotal. */
    @Transactional
    public Booking requestBookingExtension(Long customerId, Long bookingId, Integer extraMinutes) {
        if (extraMinutes == null || extraMinutes < 30 || extraMinutes % 30 != 0) {
            throw new RuntimeException("Gia hạn tối thiểu 30 phút và bước 30 phút");
        }
        Booking booking = bookingRepository.findById(bookingId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy đơn đặt lịch"));
        if (!booking.getCustomer().getId().equals(customerId)) {
            throw new RuntimeException("Bạn không có quyền gia hạn đơn này");
        }
        if (booking.getStatus() != Booking.Status.ACCEPTED && booking.getStatus() != Booking.Status.IN_PROGRESS) {
            throw new RuntimeException("Chỉ gia hạn khi đơn ở trạng thái ACCEPTED/IN_PROGRESS");
        }
        if (booking.getPendingExtensionMinutes() != null) {
            throw new RuntimeException("Đã có yêu cầu gia hạn chờ companion xử lý");
        }
        int approved = extensionApprovedSafe(booking);
        if (approved + extraMinutes > maxExtensionMinutesTotal) {
            throw new RuntimeException(String.format(
                    "Tổng thời gian gia hạn không được vượt %d phút (đã gia hạn %d phút).",
                    maxExtensionMinutesTotal, approved));
        }
        assertCompanionSlotIfExtended(booking, extraMinutes);
        booking.setPendingExtensionMinutes(extraMinutes);
        booking.setPendingExtensionRequestedAt(LocalDateTime.now());
        notificationService.create(
                booking.getCompanion().getUser().getId(),
                "Yêu cầu gia hạn lịch",
                "Khách xin gia hạn thêm " + extraMinutes + " phút cho đơn #" + booking.getId() + ". Vui lòng chấp nhận hoặc từ chối."
        );
        return bookingRepository.save(booking);
    }

    @Transactional
    public Booking cancelBookingExtensionRequest(Long customerId, Long bookingId) {
        Booking booking = bookingRepository.findById(bookingId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy đơn đặt lịch"));
        if (!booking.getCustomer().getId().equals(customerId)) {
            throw new RuntimeException("Bạn không có quyền thao tác đơn này");
        }
        if (booking.getPendingExtensionMinutes() == null) {
            throw new RuntimeException("Không có yêu cầu gia hạn đang chờ");
        }
        booking.setPendingExtensionMinutes(null);
        booking.setPendingExtensionRequestedAt(null);
        notificationService.create(
                booking.getCompanion().getUser().getId(),
                "Khách hủy yêu cầu gia hạn",
                "Khách đã hủy yêu cầu gia hạn cho đơn #" + booking.getId() + "."
        );
        return bookingRepository.save(booking);
    }

    @Transactional
    public Booking acceptBookingExtension(Long companionUserId, Long bookingId) {
        Booking booking = bookingRepository.findById(bookingId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy đơn đặt lịch"));
        if (!booking.getCompanion().getUser().getId().equals(companionUserId)) {
            throw new RuntimeException("Bạn không có quyền xử lý đơn này");
        }
        Integer pending = booking.getPendingExtensionMinutes();
        if (pending == null) {
            throw new RuntimeException("Không có yêu cầu gia hạn để chấp nhận");
        }
        if (booking.getStatus() != Booking.Status.ACCEPTED && booking.getStatus() != Booking.Status.IN_PROGRESS) {
            throw new RuntimeException("Đơn không còn trạng thái phù hợp để gia hạn");
        }
        assertCompanionSlotIfExtended(booking, pending);
        BigDecimal extraHold = calculateHoldAmount(booking.getServicePricePerHour(), pending);
        walletService.holdForBooking(booking.getCustomer(), booking, extraHold);
        booking.setDuration(booking.getDuration() + pending);
        booking.setHoldAmount(booking.getHoldAmount().add(extraHold));
        booking.setExtensionMinutesApproved(extensionApprovedSafe(booking) + pending);
        booking.setPendingExtensionMinutes(null);
        booking.setPendingExtensionRequestedAt(null);
        Booking saved = bookingRepository.save(booking);
        notificationService.create(
                booking.getCustomer().getId(),
                "Gia hạn được chấp nhận",
                "Companion đã chấp nhận gia hạn " + pending + " phút cho đơn #" + booking.getId() + ". Tiền cọc đã được cập nhật."
        );
        return saved;
    }

    @Transactional
    public Booking rejectBookingExtension(Long companionUserId, Long bookingId) {
        Booking booking = bookingRepository.findById(bookingId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy đơn đặt lịch"));
        if (!booking.getCompanion().getUser().getId().equals(companionUserId)) {
            throw new RuntimeException("Bạn không có quyền xử lý đơn này");
        }
        if (booking.getPendingExtensionMinutes() == null) {
            throw new RuntimeException("Không có yêu cầu gia hạn để từ chối");
        }
        int rejected = booking.getPendingExtensionMinutes();
        booking.setPendingExtensionMinutes(null);
        booking.setPendingExtensionRequestedAt(null);
        Booking saved = bookingRepository.save(booking);
        notificationService.create(
                booking.getCustomer().getId(),
                "Gia hạn bị từ chối",
                "Companion đã từ chối yêu cầu gia hạn " + rejected + " phút cho đơn #" + booking.getId() + "."
        );
        return saved;
    }

    /** Tránh chồng lịch với booking khác của cùng companion khi kéo dài thời lượng. */
    private void assertCompanionSlotIfExtended(Booking booking, int additionalMinutes) {
        Long companionId = booking.getCompanion().getId();
        int newDuration = booking.getDuration() + additionalMinutes;
        LocalDateTime start = booking.getBookingTime();
        boolean clash = bookingRepository.findByCompanionIdOrderByBookingTimeDesc(companionId).stream()
                .filter(b -> isActiveStatus(b.getStatus()))
                .filter(b -> !b.getId().equals(booking.getId()))
                .anyMatch(b -> overlaps(start, newDuration, b.getBookingTime(), b.getDuration()));
        if (clash) {
            throw new RuntimeException("Companion đã có lịch khác trùng khung giờ nếu gia hạn. Không thể thực hiện.");
        }
    }

    private Booking requireBookingParticipant(Long userId, Long bookingId) {
        Booking booking = bookingRepository.findById(bookingId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy đơn đặt lịch"));
        boolean isCustomer = booking.getCustomer().getId().equals(userId);
        boolean isCompanion = booking.getCompanion().getUser().getId().equals(userId);
        if (!isCustomer && !isCompanion) {
            throw new RuntimeException("Bạn không có quyền truy cập đơn đặt lịch này");
        }
        return booking;
    }

    private static void clearLiveLocationFields(Booking booking) {
        booking.setLiveLatitude(null);
        booking.setLiveLongitude(null);
        booking.setLiveLocationAt(null);
        booking.setLiveLocationRole(null);
    }

    public Map<String, Object> updateLiveLocation(Long userId, Long bookingId, Double lat, Double lng) {
        if (lat == null || lng == null) {
            throw new RuntimeException("lat và lng là bắt buộc");
        }
        Booking booking = requireBookingParticipant(userId, bookingId);
        if (booking.getStatus() != Booking.Status.ACCEPTED && booking.getStatus() != Booking.Status.IN_PROGRESS) {
            throw new RuntimeException("Chỉ chia sẻ vị trí khi đơn ACCEPTED hoặc IN_PROGRESS");
        }
        boolean isCustomer = booking.getCustomer().getId().equals(userId);
        User u = userRepository.findById(userId).orElseThrow(() -> new RuntimeException("Không tìm thấy người dùng"));
        booking.setLiveLatitude(lat);
        booking.setLiveLongitude(lng);
        booking.setLiveLocationAt(LocalDateTime.now());
        booking.setLiveLocationRole(isCustomer ? "CUSTOMER" : "COMPANION");
        bookingRepository.save(booking);
        Map<String, Object> payload = new HashMap<>();
        payload.put("bookingId", bookingId);
        payload.put("latitude", lat);
        payload.put("longitude", lng);
        payload.put("at", booking.getLiveLocationAt().toString());
        payload.put("role", booking.getLiveLocationRole());
        payload.put("username", u.getUsername());
        realtimeBroadcastService.publishBookingLiveLocation(bookingId, payload);
        return payload;
    }

    public Map<String, Object> getLiveLocation(Long userId, Long bookingId) {
        Booking booking = requireBookingParticipant(userId, bookingId);
        Map<String, Object> m = new HashMap<>();
        m.put("bookingId", bookingId);
        m.put("latitude", booking.getLiveLatitude());
        m.put("longitude", booking.getLiveLongitude());
        m.put("at", booking.getLiveLocationAt() != null ? booking.getLiveLocationAt().toString() : null);
        m.put("role", booking.getLiveLocationRole());
        return m;
    }
}
