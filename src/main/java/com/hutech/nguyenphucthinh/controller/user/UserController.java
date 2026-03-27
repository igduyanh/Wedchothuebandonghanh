package com.hutech.nguyenphucthinh.controller.user;

import com.hutech.nguyenphucthinh.model.User;
import com.hutech.nguyenphucthinh.repository.CompanionRepository;
import com.hutech.nguyenphucthinh.service.user.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import jakarta.servlet.http.HttpSession;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/user")
public class UserController {

    @Autowired
    private UserService userService;
    @Autowired
    private CompanionRepository companionRepository;

    @PostMapping("/register")
    public Map<String, Object> register(@RequestBody Map<String, String> request) {
        User user = new User();
        user.setUsername(request.get("username"));
        user.setPassword(request.get("password"));
        user.setEmail(request.get("email"));
        user.setRole(User.Role.CUSTOMER);
        
        Map<String, Object> response = new HashMap<>();
        try {
            userService.register(user);
            response.put("success", true);
            response.put("message", "Đăng ký thành công");
            return response;
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", e.getMessage());
            return response;
        }
    }

    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody Map<String, String> request, HttpSession session) {
        String username = request.get("username");
        String password = request.get("password");
        Optional<User> user = userService.login(username, password);
        Map<String, Object> response = new HashMap<>();
        if (user.isPresent()) {
            if (Boolean.TRUE.equals(user.get().getLocked())
                    || User.ModerationFlag.BANNED.equals(user.get().getModerationFlag())) {
                response.put("success", false);
                response.put("message", "Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.");
                return response;
            }
            if (User.ModerationFlag.WARNED.equals(user.get().getModerationFlag())) {
                response.put("warning", true);
                response.put("warningMessage", "Tài khoản của bạn đang ở trạng thái cảnh báo. Vui lòng tuân thủ chính sách để tránh bị khóa.");
            }
            String effectiveRole = companionRepository.findByUserId(user.get().getId()).isPresent()
                    ? "COMPANION"
                    : user.get().getRole().name();
            session.setAttribute("userId", user.get().getId());
            session.setAttribute("username", user.get().getUsername());
            session.setAttribute("role", effectiveRole);
            
            response.put("success", true);
            response.put("userId", user.get().getId());
            response.put("username", user.get().getUsername());
            response.put("role", effectiveRole);
            return response;
        } else {
            response.put("success", false);
            response.put("message", "Sai tên đăng nhập hoặc mật khẩu");
            return response;
        }
    }

    @PostMapping("/logout")
    public Map<String, Object> logout(HttpSession session) {
        session.invalidate();
        Map<String, Object> response = new HashMap<>();
        response.put("success", true);
        return response;
    }
}
