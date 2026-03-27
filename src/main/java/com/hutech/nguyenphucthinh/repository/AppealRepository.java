package com.hutech.nguyenphucthinh.repository;

import com.hutech.nguyenphucthinh.model.Appeal;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AppealRepository extends JpaRepository<Appeal, Long> {
    List<Appeal> findByUserId(Long userId);
    List<Appeal> findByStatus(Appeal.Status status);
    List<Appeal> findByUserIdAndStatus(Long userId, Appeal.Status status);
}
