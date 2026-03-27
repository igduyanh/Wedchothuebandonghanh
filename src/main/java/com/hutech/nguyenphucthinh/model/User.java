package com.hutech.nguyenphucthinh.model;

import jakarta.persistence.*;
import com.fasterxml.jackson.annotation.JsonIgnore;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String username;

    @Column(nullable = false)
    @JsonIgnore
    private String password;

    @Column(unique = true, nullable = false)
    private String email;

    @Column(length = 20)
    private String phoneNumber;

    private String fullName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Role role;

    @Column(nullable = false)
    private BigDecimal balance = BigDecimal.ZERO;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ModerationFlag moderationFlag = ModerationFlag.NONE;

    @Column(nullable = false)
    private Boolean locked = false;

    private LocalDateTime lockedUntil;
    
    @Column(name = "last_cancellation_reset_at")
    private LocalDateTime lastCancellationResetAt;

    private LocalDateTime createdAt = LocalDateTime.now();

    public enum Role {
        CUSTOMER, COMPANION, ADMIN
    }

    public enum ModerationFlag {
        NONE, WARNED, BANNED
    }
}
