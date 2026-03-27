package com.hutech.nguyenphucthinh.service.user;

import com.hutech.nguyenphucthinh.model.Favorite;
import com.hutech.nguyenphucthinh.model.User;
import com.hutech.nguyenphucthinh.model.Companion;
import com.hutech.nguyenphucthinh.repository.FavoriteRepository;
import com.hutech.nguyenphucthinh.repository.UserRepository;
import com.hutech.nguyenphucthinh.repository.CompanionRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

@Service
public class FavoriteService {
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private CompanionRepository companionRepository;
    @Autowired
    private FavoriteRepository favoriteRepository;

    public void addToFavorites(Long customerId, Long companionId) {
        if (favoriteRepository.existsByCustomer_IdAndCompanion_Id(customerId, companionId)) {
            return;
        }

        User customer = userRepository.findById(customerId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy khách hàng"));
        Companion companion = companionRepository.findById(companionId)
                .orElseThrow(() -> new RuntimeException("Không tìm thấy companion"));

        Favorite favorite = new Favorite();
        favorite.setCustomer(customer);
        favorite.setCompanion(companion);
        favoriteRepository.save(favorite);
    }

    public List<Favorite> getFavoritesByCustomer(Long customerId) {
        return favoriteRepository.findByCustomer_Id(customerId);
    }

    @Transactional
    public void removeFavorite(Long customerId, Long companionId) {
        favoriteRepository.deleteByCustomer_IdAndCompanion_Id(customerId, companionId);
    }
}
