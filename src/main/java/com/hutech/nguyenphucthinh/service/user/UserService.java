package com.hutech.nguyenphucthinh.service.user;

import com.hutech.nguyenphucthinh.model.User;
import com.hutech.nguyenphucthinh.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.util.Optional;

@Service
public class UserService {
    @Autowired
    private UserRepository userRepository;

    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    public User register(User user) {
        String username = normalize(user.getUsername());
        String email = normalize(user.getEmail());
        String password = user.getPassword() == null ? "" : user.getPassword().trim();

        if (username.isBlank()) {
            throw new RuntimeException("Tên đăng nhập không được để trống");
        }
        if (username.length() < 4 || username.length() > 30) {
            throw new RuntimeException("Tên đăng nhập phải từ 4-30 ký tự");
        }
        if (!username.matches("^[a-zA-Z0-9._-]+$")) {
            throw new RuntimeException("Tên đăng nhập chỉ được chứa chữ, số, dấu chấm, gạch dưới, gạch ngang");
        }
        if (email.isBlank()) {
            throw new RuntimeException("Email không được để trống");
        }
        if (!email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) {
            throw new RuntimeException("Email không hợp lệ");
        }
        if (password.length() < 6) {
            throw new RuntimeException("Mật khẩu phải có ít nhất 6 ký tự");
        }

        user.setUsername(username);
        user.setEmail(email);
        user.setPassword(passwordEncoder.encode(password));

        if (userRepository.findByUsername(user.getUsername()).isPresent()) {
            throw new RuntimeException("Tên đăng nhập đã tồn tại");
        }
        if (userRepository.findByEmail(user.getEmail()).isPresent()) {
            throw new RuntimeException("Email đã tồn tại");
        }
        return userRepository.save(user);
    }

    public Optional<User> login(String username, String password) {
        String normalizedUsername = normalize(username);
        String normalizedPassword = password == null ? "" : password.trim();
        if (normalizedUsername.isBlank() || normalizedPassword.isBlank()) {
            return Optional.empty();
        }
        Optional<User> found = userRepository.findByUsername(normalizedUsername);
        if (found.isEmpty()) return Optional.empty();

        User user = found.get();
        String stored = user.getPassword() == null ? "" : user.getPassword();

        // Hỗ trợ cả dữ liệu cũ (plain) và dữ liệu mới (BCrypt). Nếu login thành công bằng plain thì nâng cấp lên BCrypt.
        boolean ok;
        if (isBcryptHash(stored)) {
            ok = passwordEncoder.matches(normalizedPassword, stored);
        } else {
            ok = stored.equals(normalizedPassword);
            if (ok) {
                user.setPassword(passwordEncoder.encode(normalizedPassword));
                userRepository.save(user);
            }
        }
        return ok ? Optional.of(user) : Optional.empty();
    }

    private boolean isBcryptHash(String value) {
        // BCrypt format: $2a$ / $2b$ / $2y$
        return value != null && value.startsWith("$2");
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim();
    }
}
