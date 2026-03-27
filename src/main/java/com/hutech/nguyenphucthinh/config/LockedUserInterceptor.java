package com.hutech.nguyenphucthinh.config;

import com.hutech.nguyenphucthinh.model.User;
import com.hutech.nguyenphucthinh.repository.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.io.IOException;

/**
 * Nếu user đã bị khóa nhưng vẫn còn session đăng nhập, thì "đá" session ra ngay
 * ở lần request tiếp theo để không thể thao tác tiếp.
 */
@Component
public class LockedUserInterceptor implements HandlerInterceptor {

    private final UserRepository userRepository;

    public LockedUserInterceptor(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        HttpSession session = request.getSession(false);
        if (session == null) return true;

        Object userIdObj = session.getAttribute("userId");
        if (!(userIdObj instanceof Long userId)) return true;

        User user = userRepository.findById(userId).orElse(null);
        if (user == null) {
            // Session trỏ tới user không tồn tại → dọn session.
            safeInvalidate(session);
            return true;
        }

        // Nếu bị cảnh cáo: vẫn cho thao tác, nhưng đính kèm cảnh báo để frontend hiển thị.
        if (User.ModerationFlag.WARNED.equals(user.getModerationFlag()) && isApiRequest(request)) {
            response.setHeader(
                    "X-Account-Warning",
                    "Tài khoản của bạn đang ở trạng thái cảnh báo. Vui lòng tuân thủ chính sách để tránh bị khóa."
            );
        }

        boolean locked = Boolean.TRUE.equals(user.getLocked()) || User.ModerationFlag.BANNED.equals(user.getModerationFlag());
        if (!locked) return true;

        safeInvalidate(session);
        if (isApiRequest(request)) {
            writeLocked(response);
        } else {
            response.sendRedirect("/user/login.html");
        }
        return false;
    }

    private boolean isApiRequest(HttpServletRequest request) {
        return request.getRequestURI() != null && request.getRequestURI().startsWith("/api/");
    }

    private void writeLocked(HttpServletResponse response) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write("{\"message\":\"Tài khoản đã bị khóa. Vui lòng đăng nhập lại.\"}");
    }

    private void safeInvalidate(HttpSession session) {
        try {
            session.invalidate();
        } catch (Exception ignored) {
        }
    }
}

