package com.hutech.nguyenphucthinh.controller.user;

import com.hutech.nguyenphucthinh.model.Appeal;
import com.hutech.nguyenphucthinh.model.User;
import com.hutech.nguyenphucthinh.service.user.AppealService;
import com.hutech.nguyenphucthinh.service.user.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/appeal")
public class AppealController {

    @Autowired
    private AppealService appealService;

    @Autowired
    private UserService userService;

    @PostMapping("/submit")
    public Map<String, Object> submitAppeal(@RequestBody Map<String, String> request) {
        Map<String, Object> response = new HashMap<>();
        String username = request.get("username");
        String password = request.get("password");
        String reason = request.get("reason");

        Optional<User> userOpt = userService.login(username, password);
        if (userOpt.isEmpty()) {
            response.put("success", false);
            response.put("message", "Sai tên đăng nhập hoặc mật khẩu.");
            return response;
        }

        try {
            appealService.submitAppeal(userOpt.get(), reason);
            response.put("success", true);
            response.put("message", "Gửi khiếu nại thành công. Quản trị viên sẽ xem xét sớm nhất.");
            return response;
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", e.getMessage());
            return response;
        }
    }
}
