package com.hutech.nguyenphucthinh.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "appeals")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class Appeal {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String reason;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.PENDING;

    private LocalDateTime createdAt = LocalDateTime.now();

    public enum Status {
        PENDING, APPROVED, REJECTED
    }
}
