package com.hutech.nguyenphucthinh.service.user;

import com.hutech.nguyenphucthinh.model.Appeal;
import com.hutech.nguyenphucthinh.model.User;
import com.hutech.nguyenphucthinh.repository.AppealRepository;
import com.hutech.nguyenphucthinh.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Service
public class AppealService {

    @Autowired
    private AppealRepository appealRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private NotificationService notificationService;

    @Transactional
    public Appeal createAppeal(String username, String password, String reason) {
        // Authenticate the user manually because they are locked and can't use standard session logic
        Optional<User> found = userRepository.findByUsername(username);
        if (found.isEmpty() || found.get().getPassword() == null) {
            throw new RuntimeException("Tài khoản không tồn tại");
        }
        User user = found.get();
        
        // We do a simple password check. We can wire UserService if we need BCrypt, 
        // but for simplicity we rely on the same logic as UserService or inject it.
        // Let's assume the controller already authenticated or we do it here. 
        // Wait, better to let controller use UserService.login() ?
        // UserService.login returns empty if password is wrong but also if... wait, it just checks pass.
        // It's better to pass the authenticated User object here.
        return null;
    }

    @Transactional
    public Appeal submitAppeal(User user, String reason) {
        if (!Boolean.TRUE.equals(user.getLocked())) {
            throw new RuntimeException("Tài khoản của bạn không bị khóa, không thể khiếu nại.");
        }
        if (reason == null || reason.trim().isEmpty()) {
            throw new RuntimeException("Lý do khiếu nại không được để trống.");
        }
        
        List<Appeal> pendingAppeals = appealRepository.findByUserIdAndStatus(user.getId(), Appeal.Status.PENDING);
        if (!pendingAppeals.isEmpty()) {
            throw new RuntimeException("Bạn đã có một khiếu nại đang chờ xử lý.");
        }

        Appeal appeal = new Appeal();
        appeal.setUser(user);
        appeal.setReason(reason.trim());
        appeal.setStatus(Appeal.Status.PENDING);
        return appealRepository.save(appeal);
    }

    public List<Appeal> getAppealsByStatus(Appeal.Status status) {
        return appealRepository.findByStatus(status);
    }
    
    public List<Appeal> getAllAppeals() {
        return appealRepository.findAll();
    }

    @Transactional
    public Appeal resolveAppeal(Long appealId, boolean approve) {
        Appeal appeal = appealRepository.findById(appealId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy khiếu nại."));
        
        if (appeal.getStatus() != Appeal.Status.PENDING) {
            throw new RuntimeException("Khiếu nại này đã được xử lý.");
        }

        if (approve) {
            appeal.setStatus(Appeal.Status.APPROVED);
            User user = appeal.getUser();
            user.setLocked(false);
            user.setLockedUntil(null);
            userRepository.save(user);

            notificationService.create(
                    user.getId(),
                    "Khiếu nại được chấp thuận",
                    "Khiếu nại của bạn đã được quản trị viên duyệt. Tài khoản của bạn đã được mở khóa."
            );
        } else {
            appeal.setStatus(Appeal.Status.REJECTED);
            notificationService.create(
                    appeal.getUser().getId(),
                    "Khiếu nại bị từ chối",
                    "Khiếu nại của bạn đã bị từ chối. Vui lòng liên hệ quản trị viên để biết thêm chi tiết."
            );
        }

        return appealRepository.save(appeal);
    }
}
