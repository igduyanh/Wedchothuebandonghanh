package com.hutech.nguyenphucthinh.repository;

import com.hutech.nguyenphucthinh.model.Favorite;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface FavoriteRepository extends JpaRepository<Favorite, Long> {
    boolean existsByCustomer_IdAndCompanion_Id(Long customerId, Long companionId);
    List<Favorite> findByCustomer_Id(Long customerId);
    void deleteByCustomer_IdAndCompanion_Id(Long customerId, Long companionId);
}
