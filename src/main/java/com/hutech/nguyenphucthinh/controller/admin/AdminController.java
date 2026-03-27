package com.hutech.nguyenphucthinh.controller.admin;

import com.hutech.nguyenphucthinh.model.Companion;
import com.hutech.nguyenphucthinh.service.admin.AdminService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
public class AdminController {
    private static final String ADMIN_AUTH_ATTR = "ADMIN_AUTHORIZED";

    @Autowired
    private AdminService adminService;

    @GetMapping("/pending-companions")
    public List<Companion> getPendingCompanions(
            @RequestParam(required = false) String keyword,
            HttpServletRequest request) {
        assertAdmin(request);
        return adminService.getPendingCompanions(keyword);
    }

    @PostMapping("/approve-companion/{id}")
    public Companion approveCompanion(@PathVariable Long id, HttpServletRequest request) {
        assertAdmin(request);
        return adminService.approveCompanion(id);
    }

    @PostMapping("/reject-companion/{id}")
    public Companion rejectCompanion(@PathVariable Long id, HttpServletRequest request) {
        assertAdmin(request);
        return adminService.rejectCompanion(id);
    }

    @GetMapping("/dashboard-stats")
    public Map<String, Object> getDashboardStats(HttpServletRequest request) {
        assertAdmin(request);
        return adminService.getDashboardStats();
    }

    @GetMapping("/users")
    public Map<String, Object> getUsersData(
            @RequestParam(required = false) String keyword,
            HttpServletRequest request) {
        assertAdmin(request);
        return adminService.getUsersData(keyword);
    }

    @PostMapping("/users/{id}/warn")
    public Map<String, Object> warnUser(@PathVariable Long id, HttpServletRequest request) {
        assertAdmin(request);
        return adminService.warnUser(id);
    }

    @PostMapping("/users/{id}/ban")
    public Map<String, Object> banUser(@PathVariable Long id, HttpServletRequest request) {
        assertAdmin(request);
        return adminService.banUser(id);
    }

    @PutMapping("/users/{id}/reset-status")
    public Map<String, Object> resetUserStatus(@PathVariable Long id, HttpServletRequest request) {
        assertAdmin(request);
        return adminService.resetUserStatus(id);
    }

    @PutMapping("/users/{id}/unlock")
    public Map<String, Object> unlockUser(@PathVariable Long id, HttpServletRequest request) {
        assertAdmin(request);
        return adminService.unlockUser(id);
    }

    @GetMapping("/appeals/pending")
    public List<Map<String, Object>> getPendingAppeals(HttpServletRequest request) {
        assertAdmin(request);
        return adminService.getPendingAppeals();
    }

    @PostMapping("/appeals/{id}/resolve")
    public Map<String, Object> resolveAppeal(@PathVariable Long id, @RequestBody Map<String, Boolean> payload, HttpServletRequest request) {
        assertAdmin(request);
        return adminService.resolveAppeal(id, payload.get("approve"));
    }

    @GetMapping("/moderation/reviews")
    public List<Map<String, Object>> getReviewsForModeration(
            @RequestParam(required = false) String keyword,
            HttpServletRequest request) {
        assertAdmin(request);
        return adminService.getReviewsForModeration(keyword);
    }

    @PostMapping("/moderation/reviews/{id}/hide")
    public Map<String, Object> hideReview(@PathVariable Long id, HttpServletRequest request) {
        assertAdmin(request);
        return adminService.hideReview(id);
    }

    @GetMapping("/transactions")
    public Map<String, Object> getTransactionManagementData(
            @RequestParam(required = false) String keyword,
            HttpServletRequest request) {
        assertAdmin(request);
        return adminService.getTransactionManagementData(keyword);
    }

    @PutMapping("/transactions/commission-rate")
    public Map<String, Object> updateCommissionRate(@RequestBody Map<String, BigDecimal> payload,
                                                     HttpServletRequest request) {
        assertAdmin(request);
        return adminService.updateCommissionRate(payload.get("commissionRate"));
    }

    @PostMapping("/transactions/withdrawals/{id}/approve")
    public Map<String, Object> approveWithdrawal(@PathVariable Long id, HttpServletRequest request) {
        assertAdmin(request);
        return adminService.approveWithdrawal(id);
    }

    @PostMapping("/transactions/withdrawals/{id}/reject")
    public Map<String, Object> rejectWithdrawal(@PathVariable Long id, HttpServletRequest request) {
        assertAdmin(request);
        return adminService.rejectWithdrawal(id);
    }

    @GetMapping("/bookings/tracking")
    public List<Map<String, Object>> getTrackableBookings(HttpServletRequest request) {
        assertAdmin(request);
        return adminService.getTrackableBookings();
    }

    @GetMapping("/bookings/{id}/tracking")
    public Map<String, Object> getBookingTrackingDetail(@PathVariable Long id, HttpServletRequest request) {
        assertAdmin(request);
        return adminService.getBookingTrackingDetail(id);
    }

    @GetMapping("/disputes")
    public List<Map<String, Object>> getDisputes(HttpServletRequest request) {
        assertAdmin(request);
        return adminService.getDisputes();
    }

    @PostMapping("/disputes/{id}/freeze-escrow")
    public Map<String, Object> freezeEscrow(@PathVariable Long id, HttpServletRequest request) {
        assertAdmin(request);
        return adminService.freezeEscrow(id);
    }

    @PostMapping("/disputes/{id}/refund")
    public Map<String, Object> refundToUser(@PathVariable Long id, HttpServletRequest request) {
        assertAdmin(request);
        return adminService.refundToUser(id);
    }

    @PostMapping("/disputes/{id}/payout")
    public Map<String, Object> payoutToCompanion(@PathVariable Long id, HttpServletRequest request) {
        assertAdmin(request);
        return adminService.payoutToCompanion(id);
    }

    @PostMapping("/disputes/{id}/close")
    public Map<String, Object> closeDispute(@PathVariable Long id, HttpServletRequest request) {
        assertAdmin(request);
        return adminService.closeDispute(id);
    }

    private void assertAdmin(HttpServletRequest request) {
        Object adminAuthorized = request.getAttribute(ADMIN_AUTH_ATTR);
        if (!(adminAuthorized instanceof Boolean) || !((Boolean) adminAuthorized)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unauthorized admin access");
        }
    }
}
