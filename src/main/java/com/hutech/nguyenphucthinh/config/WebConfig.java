package com.hutech.nguyenphucthinh.config;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Autowired
    private AdminInterceptor adminInterceptor;

    @Autowired
    private LockedUserInterceptor lockedUserInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // Nếu tài khoản bị khóa trong lúc vẫn còn session đăng nhập, chặn mọi thao tác API tiếp theo.
        registry.addInterceptor(lockedUserInterceptor)
                .addPathPatterns("/api/**")
                .excludePathPatterns(
                        "/api/user/login",
                        "/api/user/register",
                        "/api/user/logout"
                );

        registry.addInterceptor(adminInterceptor)
                .addPathPatterns("/admin/**", "/api/admin/**");
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // Map folder uploads/ ra URL /uploads/** để frontend hiển thị ảnh vừa upload.
        registry.addResourceHandler("/uploads/**")
                .addResourceLocations("file:uploads/");
    }
}
