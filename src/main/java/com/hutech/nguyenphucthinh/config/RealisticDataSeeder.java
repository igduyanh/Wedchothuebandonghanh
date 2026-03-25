package com.hutech.nguyenphucthinh.config;

import com.hutech.nguyenphucthinh.model.*;
import com.hutech.nguyenphucthinh.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Component
public class RealisticDataSeeder implements CommandLineRunner {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private CompanionRepository companionRepository;

    @Autowired
    private CompanionAvailabilityRepository availabilityRepository;

    @Autowired
    private ServicePriceRepository servicePriceRepository;

    @Autowired
    private BookingRepository bookingRepository;

    @Autowired
    private ReviewRepository reviewRepository;

    @Autowired
    private NotificationRepository notificationRepository;

    @Override
    public void run(String... args) {
        // Idempotent: chỉ seed nếu DB mới gần như trống (không có companion APPROVED).
        if (!companionRepository.findByStatus(Companion.Status.APPROVED).isEmpty()) {
            return;
        }

        // ===== Users =====
        User admin = saveIfAbsentUser(
                "thinh270924@gmail.com",
                "123456",
                "admin@demo.local",
                "Thịnh (Admin)",
                User.Role.ADMIN
        );

        User customer1 = saveIfAbsentUser(
                "minhchau1",
                "123456",
                "minhchau1@example.com",
                "Minh Châu",
                User.Role.CUSTOMER
        );
        User customer2 = saveIfAbsentUser(
                "quangtran2",
                "123456",
                "quangtran2@example.com",
                "Quang Trần",
                User.Role.CUSTOMER
        );
        User customer3 = saveIfAbsentUser(
                "linhnhat3",
                "123456",
                "linhnhat3@example.com",
                "Linh Nhật",
                User.Role.CUSTOMER
        );

        // ===== Companions =====
        List<CompanionSeed> companionSeeds = List.of(
                new CompanionSeed(
                        "anhkhoa10",
                        "Hùng Anh Khoa",
                        "Bạn đồng hành lịch sự, thích cafe và trò chuyện tử tế.",
                        "Cà phê phin, đọc sách, đi dạo buổi tối",
                        "Tận tâm, lịch sự, giao tiếp nhẹ nhàng",
                        "Tối thứ 2-6",
                        "Quận 1\nQuận 3\nThủ Đức",
                        "MALE"
                ),
                new CompanionSeed(
                        "thuyduong11",
                        "Thùy Dương",
                        "Đi cùng bạn đến đúng nơi, đúng giờ. Đồng hành thân thiện.",
                        "Đọc sách, nghe nhạc, gói gọn gợi ý lịch trình",
                        "Tinh tế, dễ hợp tác",
                        "Cuối tuần",
                        "Quận 1\nBình Thạnh\nPhú Nhuận",
                        "FEMALE"
                ),
                new CompanionSeed(
                        "baoan12",
                        "Bảo An",
                        "Nếu bạn cần ai đó lắng nghe—mình ở đây.",
                        "Trà sữa, dạo phố, xem phim",
                        "Điềm tĩnh, đúng hẹn, tôn trọng không gian",
                        "Tối 2-6",
                        "Quận 5\nQuận 8\nQuận 1",
                        "FEMALE"
                )
        );

        CompanionSeed c1 = companionSeeds.get(0);
        CompanionSeed c2 = companionSeeds.get(1);
        CompanionSeed c3 = companionSeeds.get(2);

        User compUser1 = saveIfAbsentUser(c1.username, "123456", c1.email, c1.fullName, User.Role.COMPANION);
        User compUser2 = saveIfAbsentUser(c2.username, "123456", c2.email, c2.fullName, User.Role.COMPANION);
        User compUser3 = saveIfAbsentUser(c3.username, "123456", c3.email, c3.fullName, User.Role.COMPANION);

        Companion companion1 = saveCompanionApproved(
                compUser1, c1.bio, c1.hobbies, c1.appearance, c1.availability, c1.serviceType, c1.area, c1.rentalVenues, c1.gender
        );
        Companion companion2 = saveCompanionApproved(
                compUser2, c2.bio, c2.hobbies, c2.appearance, c2.availability, c2.serviceType, c2.area, c2.rentalVenues, c2.gender
        );
        Companion companion3 = saveCompanionApproved(
                compUser3, c3.bio, c3.hobbies, c3.appearance, c3.availability, c3.serviceType, c3.area, c3.rentalVenues, c3.gender
        );

        // ===== Service prices =====
        seedServicePrices(companion1, new BigDecimal("180000"), new BigDecimal("220000"));
        seedServicePrices(companion2, new BigDecimal("200000"), new BigDecimal("260000"));
        seedServicePrices(companion3, new BigDecimal("190000"), new BigDecimal("240000"));

        // ===== Availabilities =====
        seedAvailabilities(companion1, "Tư vấn nhanh & đồng hành", LocalDateTime.now().plusDays(1).withHour(18).withMinute(0), 120);
        seedAvailabilities(companion2, "Cuối tuần linh hoạt", LocalDateTime.now().plusDays(2).withHour(19).withMinute(0), 180);
        seedAvailabilities(companion3, "Tối êm dịu", LocalDateTime.now().plusDays(1).withHour(20).withMinute(0), 120);

        // ===== Bookings for tracking/chat =====
        seedBookingAcceptedAndInProgress(customer1, companion1, "Quận 1", companion1);
        seedBookingInProgressAndCompleted(customer2, companion2, "Quận 1", companion2);
        seedBookingAcceptedOnly(customer3, companion3, "Quận 1", companion3);

        // ===== SOS admin notification (with Google Maps link) =====
        seedSosNotification(admin.getId(), 10.762622, 106.660172);
    }

    private void seedSosNotification(Long adminUserId, double lat, double lng) {
        User admin = userRepository.findById(adminUserId).orElseThrow();
        Notification n = new Notification();
        n.setUser(admin);
        n.setTitle("SOS KHẨN CẤP");
        n.setIsRead(false);
        n.setContent(
                "Khách: user-demo (#1)\n\n" +
                "Bị tố: user-demo (#2)\n\n" +
                "Loại: OTHER\n\n" +
                "— Mô tả —\n" +
                "Tình huống khẩn cấp cần hỗ trợ ngay.\n\n" +
                "— Vị trí thiết bị lúc gửi (GPS) —\n" +
                String.format(java.util.Locale.ROOT, "%.6f, %.6f\n", lat, lng) +
                "Google Maps: https://www.google.com/maps?q=" + lat + "," + lng
        );
        notificationRepository.save(n);
    }

    private void seedAvailabilities(Companion companion, String note, LocalDateTime start, int minutes) {
        CompanionAvailability a = new CompanionAvailability();
        a.setCompanion(companion);
        a.setStartTime(start);
        a.setEndTime(start.plusMinutes(minutes));
        a.setNote(note);
        availabilityRepository.save(a);
    }

    private void seedServicePrices(Companion companion, BigDecimal min, BigDecimal max) {
        ServicePrice p1 = new ServicePrice();
        p1.setCompanion(companion);
        p1.setServiceName("Đồng hành cá nhân");
        p1.setPricePerHour(min);
        p1.setDescription("Phù hợp đi cùng, trò chuyện, hỗ trợ sắp xếp nhẹ nhàng (demo).");
        servicePriceRepository.save(p1);

        ServicePrice p2 = new ServicePrice();
        p2.setCompanion(companion);
        p2.setServiceName("Đồng hành theo lịch trình");
        p2.setPricePerHour(max);
        p2.setDescription("Đi cùng theo kế hoạch, nhắc hẹn & giữ liên lạc đúng giờ (demo).");
        servicePriceRepository.save(p2);
    }

    private void seedBookingAcceptedAndInProgress(User customer, Companion companion, String rentalVenue, Companion cForRental) {
        // ACCEPTED
        Booking accepted = new Booking();
        accepted.setCustomer(customer);
        accepted.setCompanion(cForRental);
        accepted.setBookingTime(LocalDateTime.now().minusMinutes(30));
        accepted.setDuration(60);
        accepted.setRentalVenue(rentalVenue);
        accepted.setLocation("Điểm hẹn cafe gần trung tâm");
        accepted.setServiceName("Đồng hành cá nhân");
        accepted.setServicePricePerHour(new BigDecimal("200000"));
        accepted.setNote("Cuộc hẹn demo - bắt đầu trò chuyện đúng giờ.");
        accepted.setHoldAmount(BigDecimal.valueOf(200000).multiply(BigDecimal.valueOf(1)));
        accepted.setStatus(Booking.Status.ACCEPTED);
        accepted.setAcceptedAt(LocalDateTime.now().minusMinutes(29));

        double cLat = 10.762622;
        double cLng = 106.660172;
        double pLat = 10.762720;
        double pLng = 106.660260;
        accepted.setCustomerCheckInLatitude(cLat);
        accepted.setCustomerCheckInLongitude(cLng);
        accepted.setCompanionCheckInLatitude(pLat);
        accepted.setCompanionCheckInLongitude(pLng);
        accepted.setCheckInLatitude((cLat + pLat) / 2.0);
        accepted.setCheckInLongitude((cLng + pLng) / 2.0);

        accepted.setLiveLatitude(cLat + 0.00005);
        accepted.setLiveLongitude(cLng + 0.00005);
        accepted.setLiveLocationAt(LocalDateTime.now().minusMinutes(5));
        accepted.setLiveLocationRole("COMPANION");
        bookingRepository.save(accepted);

        // IN_PROGRESS (booking thứ 2)
        Booking inProgress = new Booking();
        inProgress.setCustomer(customer);
        inProgress.setCompanion(cForRental);
        inProgress.setBookingTime(LocalDateTime.now().minusMinutes(75));
        inProgress.setDuration(90);
        inProgress.setRentalVenue(rentalVenue);
        inProgress.setLocation("Quán cafe & đi dạo nhẹ");
        inProgress.setServiceName("Đồng hành theo lịch trình");
        inProgress.setServicePricePerHour(new BigDecimal("240000"));
        inProgress.setNote("Demo: đang diễn ra, theo dõi vị trí realtime.");
        inProgress.setHoldAmount(BigDecimal.valueOf(240000).multiply(BigDecimal.valueOf(1.5)));
        inProgress.setStatus(Booking.Status.IN_PROGRESS);
        inProgress.setAcceptedAt(LocalDateTime.now().minusMinutes(74));
        inProgress.setStartedAt(LocalDateTime.now().minusMinutes(60));

        double p2Lat = 10.762900;
        double p2Lng = 106.660400;
        inProgress.setCustomerCheckInLatitude(cLat);
        inProgress.setCustomerCheckInLongitude(cLng);
        inProgress.setCompanionCheckInLatitude(p2Lat);
        inProgress.setCompanionCheckInLongitude(p2Lng);
        inProgress.setCheckInLatitude((cLat + p2Lat) / 2.0);
        inProgress.setCheckInLongitude((cLng + p2Lng) / 2.0);

        inProgress.setLiveLatitude(p2Lat + 0.00002);
        inProgress.setLiveLongitude(p2Lng + 0.00002);
        inProgress.setLiveLocationAt(LocalDateTime.now().minusMinutes(2));
        inProgress.setLiveLocationRole("CUSTOMER");
        bookingRepository.save(inProgress);
    }

    private void seedBookingAcceptedOnly(User customer, Companion companion, String rentalVenue, Companion cForRental) {
        Booking accepted = new Booking();
        accepted.setCustomer(customer);
        accepted.setCompanion(cForRental);
        accepted.setBookingTime(LocalDateTime.now().minusMinutes(25));
        accepted.setDuration(60);
        accepted.setRentalVenue(rentalVenue);
        accepted.setLocation("Điểm hẹn demo (tối muộn)");
        accepted.setServiceName("Đồng hành cá nhân");
        accepted.setServicePricePerHour(new BigDecimal("200000"));
        accepted.setNote("Demo: booking ACCEPTED khác để nhìn danh sách admin.");
        accepted.setHoldAmount(BigDecimal.valueOf(200000));
        accepted.setStatus(Booking.Status.ACCEPTED);
        accepted.setAcceptedAt(LocalDateTime.now().minusMinutes(24));

        double cLat = 10.762500;
        double cLng = 106.660090;
        double pLat = 10.762610;
        double pLng = 106.660180;
        accepted.setCustomerCheckInLatitude(cLat);
        accepted.setCustomerCheckInLongitude(cLng);
        accepted.setCompanionCheckInLatitude(pLat);
        accepted.setCompanionCheckInLongitude(pLng);
        accepted.setCheckInLatitude((cLat + pLat) / 2.0);
        accepted.setCheckInLongitude((cLng + pLng) / 2.0);

        accepted.setLiveLatitude((cLat + 0.00007));
        accepted.setLiveLongitude((cLng + 0.00008));
        accepted.setLiveLocationAt(LocalDateTime.now().minusMinutes(4));
        accepted.setLiveLocationRole("CUSTOMER");
        bookingRepository.save(accepted);
    }

    private void seedBookingInProgressAndCompleted(User customer, Companion companion, String rentalVenue, Companion cForRental) {
        // Completed booking for review screen
        Booking completed = new Booking();
        completed.setCustomer(customer);
        completed.setCompanion(cForRental);
        completed.setBookingTime(LocalDateTime.now().minusHours(4));
        completed.setDuration(60);
        completed.setRentalVenue(rentalVenue);
        completed.setLocation("Kết thúc demo - điểm hẹn đã hoàn tất");
        completed.setServiceName("Đồng hành cá nhân");
        completed.setServicePricePerHour(new BigDecimal("210000"));
        completed.setNote("Demo: booking đã hoàn tất để test hiển thị review.");
        completed.setHoldAmount(BigDecimal.valueOf(210000));
        completed.setStatus(Booking.Status.COMPLETED);
        completed.setAcceptedAt(LocalDateTime.now().minusHours(4).plusMinutes(1));
        completed.setStartedAt(LocalDateTime.now().minusHours(4).plusMinutes(5));
        completed.setCompletedAt(LocalDateTime.now().minusHours(3));

        double cInLat = 10.762600;
        double cInLng = 106.660140;
        double pInLat = 10.762740;
        double pInLng = 106.660220;
        completed.setCustomerCheckInLatitude(cInLat);
        completed.setCustomerCheckInLongitude(cInLng);
        completed.setCompanionCheckInLatitude(pInLat);
        completed.setCompanionCheckInLongitude(pInLng);
        completed.setCheckInLatitude((cInLat + pInLat) / 2.0);
        completed.setCheckInLongitude((cInLng + pInLng) / 2.0);

        double cOutLat = 10.762820;
        double cOutLng = 106.660360;
        double pOutLat = 10.762860;
        double pOutLng = 106.660410;
        completed.setCustomerCheckOutLatitude(cOutLat);
        completed.setCustomerCheckOutLongitude(cOutLng);
        completed.setCompanionCheckOutLatitude(pOutLat);
        completed.setCompanionCheckOutLongitude(pOutLng);
        completed.setCheckOutLatitude((cOutLat + pOutLat) / 2.0);
        completed.setCheckOutLongitude((cOutLng + pOutLng) / 2.0);

        completed.setLiveLatitude(cInLat);
        completed.setLiveLongitude(cInLng);
        completed.setLiveLocationAt(LocalDateTime.now().minusHours(3).plusMinutes(55));
        completed.setLiveLocationRole("COMPANION");
        bookingRepository.save(completed);

        Review r = new Review();
        r.setBooking(completed);
        r.setRating(5);
        r.setComment("Trải nghiệm rất tốt. Đúng giờ, đồng hành nhiệt tình và hỗ trợ nhẹ nhàng (demo).");
        reviewRepository.save(r);
    }

    private Companion saveCompanionApproved(
            User user,
            String bio,
            String hobbies,
            String appearance,
            String availability,
            String serviceType,
            String area,
            String rentalVenues,
            String gender
    ) {
        // Nếu đã có companion cho user này thì trả lại (tránh trùng).
        return companionRepository.findByUserId(user.getId()).orElseGet(() -> {
            Companion c = new Companion();
            c.setUser(user);
            c.setBio(bio);
            c.setHobbies(hobbies);
            c.setAppearance(appearance);
            c.setAvailability(availability);
            c.setServiceType(serviceType);
            c.setArea(area);
            c.setRentalVenues(rentalVenues);
            c.setGender(gender);
            c.setOnlineStatus(true);
            c.setStatus(Companion.Status.APPROVED);
            c.setAvatarUrl("/images/hinh_anh_dep_du_lich_5.jpg");
            c.setCoverUrl("/images/hinh_anh_dep_du_lich_5.jpg");
            c.setPricePerHour(new BigDecimal("200000"));
            return companionRepository.save(c);
        });
    }

    private User saveIfAbsentUser(String username, String password, String email, String fullName, User.Role role) {
        return userRepository.findByUsername(username).orElseGet(() -> {
            User u = new User();
            u.setUsername(username);
            u.setPassword(password);
            u.setEmail(email);
            u.setFullName(fullName);
            u.setRole(role);
            u.setLocked(false);
            u.setBalance(BigDecimal.ZERO);
            return userRepository.save(u);
        });
    }

    private static class CompanionSeed {
        final String username;
        final String fullName;
        final String bio;
        final String hobbies;
        final String appearance;
        final String availability;
        final String rentalVenues;
        final String gender;
        final String email;

        // defaults (serviceType/area có thể thay sau nếu bạn muốn)
        final String serviceType = "Tâm sự";
        final String area = "Quận trung tâm";

        CompanionSeed(String username, String fullName, String bio, String hobbies, String appearance, String availability,
                      String rentalVenues, String gender) {
            this.username = username;
            this.fullName = fullName;
            this.bio = bio;
            this.hobbies = hobbies;
            this.appearance = appearance;
            this.availability = availability;
            this.rentalVenues = rentalVenues;
            this.gender = gender;
            this.email = username + "@demo.local";
        }
    }
}

