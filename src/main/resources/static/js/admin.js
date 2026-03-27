async function requestJson(url, options = {}) {
    const merged = {
        credentials: "same-origin",
        ...options,
        headers: {
            ...(options.headers || {}),
        },
    };
    if (merged.body != null && typeof merged.body === "string" && !merged.headers["Content-Type"]) {
        merged.headers["Content-Type"] = "application/json";
    }
    const response = await fetch(url, merged);
    if (response.status === 401 || response.status === 403) {
        window.location.href = "/user/login.html";
        throw new Error("Unauthorized");
    }
    if (!response.ok) {
        const text = await response.text();
        let message = text;
        try {
            const json = JSON.parse(text);
            message = json.message || text;
        } catch (_) {}
        throw new Error(message);
    }
    const text = await response.text();
    if (!text || !text.trim()) {
        return null;
    }
    try {
        return JSON.parse(text);
    } catch (_) {
        return null;
    }
}

function showAlert(message, type = "success") {
    const box = document.getElementById("admin-alert");
    if (!box) {
        return;
    }
    box.innerHTML = `<div class="alert alert-${type} mb-0">${message}</div>`;
}

function clearAlert() {
    const box = document.getElementById("admin-alert");
    if (box) {
        box.innerHTML = "";
    }
}

function readAuthEvidence() {
    const localRole = localStorage.getItem("role");
    const sessionRole = sessionStorage.getItem("role");
    const localUserId = localStorage.getItem("userId") || localStorage.getItem("user_id");
    const sessionUserId = sessionStorage.getItem("userId") || sessionStorage.getItem("user_id");
    const localToken = localStorage.getItem("token") || localStorage.getItem("jwt");
    const sessionToken = sessionStorage.getItem("token") || sessionStorage.getItem("jwt");
    const hasSessionCookie = document.cookie.includes("JSESSIONID=");

    return {
        role: sessionRole || localRole,
        hasUserId: Boolean(localUserId || sessionUserId),
        hasToken: Boolean(localToken || sessionToken),
        hasSessionCookie
    };
}

async function ensureAdminAccess() {
    try {
        const me = await requestJson("/api/auth/me", { method: "GET" });
        if (!me?.authenticated || me.role !== "ADMIN") {
            window.location.href = "/user/login.html";
            return false;
        }
        return true;
    } catch (_) {
        const auth = readAuthEvidence();
        const hasAdminSignal = auth.role === "ADMIN" && (auth.hasUserId || auth.hasToken || auth.hasSessionCookie);
        if (hasAdminSignal) {
            return true;
        }
        window.location.href = "/user/login.html";
        return false;
    }
}

function formatMoney(value) {
    const number = Number(value || 0);
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(number);
}

function escapeHtml(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/** Nội dung SOS từ server (nhiều dòng) → HTML dễ quét: nhãn đậm, mục tách, link Maps an toàn. */
function formatSosNotificationContentHtml(raw) {
    if (!raw) return "";
    const lines = String(raw).replace(/\r\n/g, "\n").split("\n");
    const out = [];
    const maxKeyLen = 36;
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith("— ") && trimmed.endsWith("—") && trimmed.length > 4) {
            out.push(
                `<div class="sos-section-h small fw-bold text-uppercase text-danger mt-3 mb-2 pb-1 border-bottom border-danger border-opacity-25">${escapeHtml(trimmed)}</div>`
            );
            continue;
        }
        const mapLine = trimmed.match(/^(Google Maps:)\s*(https:\/\/.+)$/i);
        if (mapLine && /^https:\/\/(www\.)?google\.com\/maps\?q=/i.test(mapLine[2].trim())) {
            const href = mapLine[2].trim();
            out.push(
                `<div class="mb-2"><span class="text-secondary fw-semibold">${escapeHtml(mapLine[1])}</span> <a href="${escapeHtml(href)}" target="_blank" rel="noopener" class="fw-semibold">Mở trên Google Maps</a></div>`
            );
            continue;
        }
        const kv = line.match(/^([^:]+):\s*(.*)$/);
        if (kv && kv[1].length <= maxKeyLen && !/^https?:/i.test(kv[1].trim())) {
            out.push(
                `<div class="d-flex flex-wrap gap-2 mb-1 align-items-baseline sos-kv-row"><span class="text-secondary fw-semibold flex-shrink-0" style="min-width:8.5rem">${escapeHtml(kv[1])}:</span><span class="text-break flex-grow-1">${escapeHtml(kv[2] || "—")}</span></div>`
            );
            continue;
        }
        if (/^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(trimmed)) {
            out.push(`<div class="font-monospace small text-body mb-2 user-select-all">${escapeHtml(trimmed)}</div>`);
            continue;
        }
        out.push(`<div class="mb-1 text-break">${escapeHtml(line)}</div>`);
    }
    return out.join("");
}

function getPageSearchKeyword() {
    return document.querySelector('[data-cy="search-input"]')?.value?.trim() || "";
}

function clearPageSearchKeyword() {
    const input = document.querySelector('[data-cy="search-input"]');
    if (input) {
        input.value = "";
    }
}

function renderEmptyRow(tbody, colSpan, message) {
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="${Number(colSpan) || 1}" class="text-center text-muted">${escapeHtml(
        message || "Không có dữ liệu."
    )}</td></tr>`;
}

function wireAdminSearch(runSearch) {
    const input = document.querySelector('[data-cy="search-input"]');
    const btn = document.querySelector('[data-cy="search-btn"]');
    if (!input || !btn) {
        return;
    }
    const go = () => {
        clearAlert();
        runSearch();
    };
    btn.addEventListener("click", go);
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            go();
        }
    });
}

const adminChartState = {
    range: "month",
    eventsChart: null,
    sourceChart: null,
    payload: null
};

function startOfWeek(date) {
    const d = new Date(date);
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
}

function buildAdminBuckets(range) {
    const now = new Date();
    const buckets = [];
    if (range === "day") {
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            d.setHours(0, 0, 0, 0);
            buckets.push({
                key: `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`,
                label: d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })
            });
        }
    } else if (range === "week") {
        const current = startOfWeek(now);
        for (let i = 7; i >= 0; i--) {
            const d = new Date(current);
            d.setDate(d.getDate() - i * 7);
            buckets.push({
                key: `${d.getFullYear()}-W${Math.ceil((((d - new Date(d.getFullYear(), 0, 1)) / 86400000) + 1) / 7)}`,
                label: `Tuần ${Math.ceil((((d - new Date(d.getFullYear(), 0, 1)) / 86400000) + 1) / 7)}`
            });
        }
    } else if (range === "year") {
        for (let i = 4; i >= 0; i--) {
            const y = now.getFullYear() - i;
            buckets.push({ key: String(y), label: String(y) });
        }
    } else {
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            buckets.push({
                key: `${d.getFullYear()}-${d.getMonth() + 1}`,
                label: d.toLocaleDateString("vi-VN", { month: "2-digit", year: "2-digit" })
            });
        }
    }
    return buckets;
}

function toAdminBucketKey(dateValue, range) {
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return null;
    if (range === "day") return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    if (range === "week") {
        const s = startOfWeek(d);
        return `${s.getFullYear()}-W${Math.ceil((((s - new Date(s.getFullYear(), 0, 1)) / 86400000) + 1) / 7)}`;
    }
    if (range === "year") return String(d.getFullYear());
    return `${d.getFullYear()}-${d.getMonth() + 1}`;
}

function aggregateAdminSeries(items, dateGetter, range, bucketIndex) {
    const arr = new Array(Object.keys(bucketIndex).length).fill(0);
    (Array.isArray(items) ? items : []).forEach((it) => {
        const key = toAdminBucketKey(dateGetter(it), range);
        if (key != null && bucketIndex[key] != null) {
            arr[bucketIndex[key]] += 1;
        }
    });
    return arr;
}

const companionReviewState = {
    activeId: null
};

function renderCompanionReviewDetail(item) {
    const user = item?.user || {};
    const toLink = (url) => {
        if (!url) return '<span class="text-muted">Không có</span>';
        return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`;
    };
    return `
        <div class="row g-3">
            <div class="col-md-6"><div><strong>ID hồ sơ:</strong> ${item?.id ?? "-"}</div></div>
            <div class="col-md-6"><div><strong>ID user:</strong> ${user?.id ?? "-"}</div></div>
            <div class="col-md-6"><div><strong>Username:</strong> ${escapeHtml(user?.username || "-")}</div></div>
            <div class="col-md-6"><div><strong>Email:</strong> ${escapeHtml(user?.email || "-")}</div></div>
            <div class="col-md-6"><div><strong>Họ tên:</strong> ${escapeHtml(user?.fullName || "-")}</div></div>
            <div class="col-md-6"><div><strong>Trạng thái:</strong> <span class="badge text-bg-warning">${escapeHtml(item?.status || "PENDING")}</span></div></div>
            <div class="col-md-6"><div><strong>Dịch vụ:</strong> ${escapeHtml(item?.serviceType || "-")}</div></div>
            <div class="col-md-6"><div><strong>Khu vực:</strong> ${escapeHtml(item?.area || "-")}</div></div>
            <div class="col-md-6"><div><strong>Giới tính:</strong> ${escapeHtml(item?.gender || "-")}</div></div>
            <div class="col-12"><div><strong>Tiểu sử:</strong><div class="text-muted mt-1">${escapeHtml(item?.bio || "-")}</div></div></div>
            <div class="col-12"><div><strong>Sở thích:</strong><div class="text-muted mt-1">${escapeHtml(item?.hobbies || "-")}</div></div></div>
            <div class="col-12"><div><strong>Ngoại hình:</strong><div class="text-muted mt-1">${escapeHtml(item?.appearance || "-")}</div></div></div>
            <div class="col-12"><div><strong>Lịch rảnh:</strong><div class="text-muted mt-1">${escapeHtml(item?.availability || "-")}</div></div></div>
            <div class="col-md-4"><div><strong>Số CCCD/CMND:</strong> ${escapeHtml(item?.identityNumber || "-")}</div></div>
            <div class="col-md-8"><div><strong>Ảnh CCCD:</strong> ${toLink(item?.identityImageUrl)}</div></div>
            <div class="col-md-12"><div><strong>Ảnh chân dung:</strong> ${toLink(item?.portraitImageUrl)}</div></div>
            <div class="col-md-12"><div><strong>Avatar:</strong> ${toLink(item?.avatarUrl)}</div></div>
            <div class="col-md-12"><div><strong>Video giới thiệu:</strong> ${toLink(item?.introVideoUrl)}</div></div>
        </div>
    `;
}

function openCompanionReviewModal(item, tableBodyId) {
    companionReviewState.activeId = item?.id ?? null;
    const detailBox = document.getElementById("companion-review-detail");
    if (detailBox) {
        detailBox.innerHTML = renderCompanionReviewDetail(item);
    }
    const approveBtn = document.getElementById("companion-approve-btn");
    const rejectBtn = document.getElementById("companion-reject-btn");
    if (approveBtn) {
        approveBtn.onclick = async () => {
            if (!companionReviewState.activeId) return;
            await moderateCompanion(companionReviewState.activeId, true, tableBodyId);
            bootstrap.Modal.getInstance(document.getElementById("companion-review-modal"))?.hide();
        };
    }
    if (rejectBtn) {
        rejectBtn.onclick = async () => {
            if (!companionReviewState.activeId) return;
            await moderateCompanion(companionReviewState.activeId, false, tableBodyId);
            bootstrap.Modal.getInstance(document.getElementById("companion-review-modal"))?.hide();
        };
    }
    new bootstrap.Modal(document.getElementById("companion-review-modal")).show();
}

function buildUserActionButtons(userId) {
    const template = document.getElementById("user-actions-template");
    if (template?.content) {
        const fragment = template.content.cloneNode(true);
        fragment.querySelectorAll("button[data-action]").forEach((button) => {
            button.dataset.id = String(userId);
        });
        return fragment;
    }

    const fallback = document.createDocumentFragment();
    const warnBtn = document.createElement("button");
    warnBtn.className = "btn btn-sm btn-warning me-1";
    warnBtn.dataset.action = "warn";
    warnBtn.dataset.id = String(userId);
    warnBtn.textContent = "Cảnh cáo";

    const banBtn = document.createElement("button");
    banBtn.className = "btn btn-sm btn-danger me-1";
    banBtn.dataset.action = "ban";
    banBtn.dataset.id = String(userId);
    banBtn.textContent = "Khóa";

    const resetBtn = document.createElement("button");
    resetBtn.className = "btn btn-sm btn-success";
    resetBtn.dataset.action = "reset-status";
    resetBtn.dataset.id = String(userId);
    resetBtn.setAttribute("data-cy", "btn-reset-status");
    resetBtn.textContent = "Bình thường";

    fallback.append(warnBtn, banBtn, resetBtn);
    return fallback;
}

function bindLogout() {
    const logoutBtn = document.getElementById("logout-btn");
    if (!logoutBtn) {
        return;
    }
    logoutBtn.addEventListener("click", async () => {
        clearAlert();
        logoutBtn.disabled = true;
        try {
            const res = await fetch("/api/user/logout", { method: "POST", credentials: "same-origin" });
            let data = null;
            try {
                data = await res.json();
            } catch (_) {
                // Some responses might not return JSON; we treat ok status as success.
            }
            if (!res.ok) {
                throw new Error(data?.message || "Đăng xuất thất bại");
            }
            if (data && data.success === false) {
                throw new Error(data.message || "Đăng xuất thất bại");
            }
            window.location.href = "/user/index.html";
        } catch (e) {
            showAlert(e?.message || "Đăng xuất thất bại.", "danger");
        } finally {
            logoutBtn.disabled = false;
        }
    });
}

async function loadDashboardStats() {
    const stats = await requestJson("/api/admin/dashboard-stats");
    const profitEl = document.getElementById("stat-profit");
    const totalEl = document.getElementById("stat-transactions");
    const cancelledEl = document.getElementById("stat-cancelled");

    if (profitEl) profitEl.textContent = formatMoney(stats.platformProfit);
    if (totalEl) totalEl.textContent = String(stats.totalTransactions ?? 0);
    if (cancelledEl) cancelledEl.textContent = String(stats.cancelledBookings ?? 0);
}

async function loadAdminDashboardCharts() {
    if (typeof Chart === "undefined") return;
    const rangeEl = document.getElementById("admin-chart-range");
    const range = rangeEl?.value || adminChartState.range || "month";
    adminChartState.range = range;

    const [reviews, disputes, tx] = await Promise.all([
        requestJson("/api/admin/moderation/reviews"),
        requestJson("/api/admin/disputes"),
        requestJson("/api/admin/transactions")
    ]);
    const withdrawalForChart = Array.isArray(tx?.withdrawalChartEvents)
        ? tx.withdrawalChartEvents
        : Array.isArray(tx?.pendingWithdrawals)
          ? tx.pendingWithdrawals
          : [];
    adminChartState.payload = {
        reviews: Array.isArray(reviews) ? reviews : [],
        disputes: Array.isArray(disputes) ? disputes : [],
        withdrawals: withdrawalForChart
    };

    const buckets = buildAdminBuckets(range);
    const labels = buckets.map((b) => b.label);
    const bucketIndex = {};
    buckets.forEach((b, i) => { bucketIndex[b.key] = i; });

    const reviewSeries = aggregateAdminSeries(adminChartState.payload.reviews, (x) => x.createdAt, range, bucketIndex);
    const disputeSeries = aggregateAdminSeries(adminChartState.payload.disputes, (x) => x.createdAt, range, bucketIndex);
    const withdrawalSeries = aggregateAdminSeries(adminChartState.payload.withdrawals, (x) => x.createdAt, range, bucketIndex);

    const eventsCtx = document.getElementById("admin-events-chart");
    if (eventsCtx) {
        adminChartState.eventsChart?.destroy();
        adminChartState.eventsChart = new Chart(eventsCtx, {
            type: "line",
            data: {
                labels,
                datasets: [
                    { label: "Review mới", data: reviewSeries, borderColor: "#8b5cf6", backgroundColor: "rgba(139,92,246,.15)", tension: 0.3, fill: true },
                    { label: "Tranh chấp", data: disputeSeries, borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,.12)", tension: 0.3, fill: true },
                    { label: "Lệnh rút tiền", data: withdrawalSeries, borderColor: "#0ea5e9", backgroundColor: "rgba(14,165,233,.12)", tension: 0.3, fill: true }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        onClick: () => {}
                    }
                }
            }
        });
    }

    const sourceCtx = document.getElementById("admin-source-chart");
    if (sourceCtx) {
        adminChartState.sourceChart?.destroy();
        adminChartState.sourceChart = new Chart(sourceCtx, {
            type: "doughnut",
            data: {
                labels: ["Review", "Tranh chấp", "Lệnh rút tiền"],
                datasets: [{
                    data: [
                        reviewSeries.reduce((a, b) => a + b, 0),
                        disputeSeries.reduce((a, b) => a + b, 0),
                        withdrawalSeries.reduce((a, b) => a + b, 0)
                    ],
                    backgroundColor: ["#8b5cf6", "#ef4444", "#0ea5e9"]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        onClick: () => {}
                    }
                }
            }
        });
    }
}

function resolvePendingCompanionsKeyword(explicitKeyword, tableBodyId) {
    if (explicitKeyword !== undefined && explicitKeyword !== null) {
        return String(explicitKeyword).trim();
    }
    if (window.location.pathname.endsWith("/moderation.html") && tableBodyId === "moderation-pending-body") {
        return getPageSearchKeyword();
    }
    return "";
}

async function loadPendingCompanions(tableBodyId, explicitKeyword) {
    const rows = document.getElementById(tableBodyId);
    if (!rows) {
        return;
    }
    const kw = resolvePendingCompanionsKeyword(explicitKeyword, tableBodyId);
    const q = kw ? `?keyword=${encodeURIComponent(kw)}` : "";
    const data = await requestJson(`/api/admin/pending-companions${q}`);
    rows.innerHTML = "";

    if (!data.length) {
        rows.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Không có hồ sơ chờ duyệt.</td></tr>';
        return;
    }

    data.forEach((item) => {
        const tr = document.createElement("tr");
        const isModerationPage = tableBodyId === "moderation-pending-body";
        const actionHtml = isModerationPage
            ? `<button class="btn btn-sm btn-outline-primary" data-action="view-profile" data-id="${item.id}">Xem hồ sơ</button>`
            : `<button class="btn btn-sm btn-success me-1" data-action="approve" data-id="${item.id}">Cấp tích xanh</button>
               <button class="btn btn-sm btn-danger" data-action="reject" data-id="${item.id}">Từ chối</button>`;
        tr.innerHTML = `
            <td>${item.id}</td>
            <td>${escapeHtml(item.user?.username || "")}</td>
            <td>${escapeHtml(item.bio || "")}</td>
            <td><span class="badge text-bg-warning">${escapeHtml(item.status || "PENDING")}</span></td>
            <td>${actionHtml}</td>
        `;
        rows.appendChild(tr);
    });

    if (tableBodyId === "moderation-pending-body") {
        rows.querySelectorAll('button[data-action="view-profile"]').forEach((btn) => {
            btn.addEventListener("click", () => {
                const item = data.find((x) => String(x.id) === String(btn.dataset.id));
                if (!item) return;
                openCompanionReviewModal(item, tableBodyId);
            });
        });
    } else {
        rows.querySelectorAll('button[data-action="approve"]').forEach((btn) => {
            btn.addEventListener("click", () => moderateCompanion(btn.dataset.id, true, tableBodyId));
        });
        rows.querySelectorAll('button[data-action="reject"]').forEach((btn) => {
            btn.addEventListener("click", () => moderateCompanion(btn.dataset.id, false, tableBodyId));
        });
    }
}

async function moderateCompanion(id, isApprove, tableBodyId) {
    const url = isApprove ? `/api/admin/approve-companion/${id}` : `/api/admin/reject-companion/${id}`;
    await requestJson(url, { method: "POST" });
    showAlert(isApprove ? "Đã cấp tích xanh cho Companion." : "Đã từ chối hồ sơ Companion.");
    await loadPendingCompanions(tableBodyId);
    if (document.getElementById("stat-profit")) {
        await loadDashboardStats();
    }
}

async function loadUsersPage(keyword) {
    const usersBody = document.getElementById("users-body");
    const companionsBody = document.getElementById("companions-body");
    if (!usersBody || !companionsBody) return;
    const k = keyword !== undefined && keyword !== null ? String(keyword).trim() : getPageSearchKeyword();
    const q = k ? `?keyword=${encodeURIComponent(k)}` : "";
    const data = await requestJson(`/api/admin/users${q}`);
    usersBody.innerHTML = "";
    companionsBody.innerHTML = "";

    if (!data?.users?.length) {
        renderEmptyRow(usersBody, 6, "Không có tài khoản phù hợp.");
    }
    data.users.forEach((user) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${user.id}</td>
            <td>${escapeHtml(user.username)}</td>
            <td>${escapeHtml(user.email)}</td>
            <td>${escapeHtml(user.role)}</td>
            <td><span class="badge ${user.flag === "BANNED" ? "text-bg-danger" : user.flag === "WARNED" ? "text-bg-warning" : "text-bg-secondary"}">${escapeHtml(user.flag === "BANNED" ? "Đã khóa" : user.flag === "WARNED" ? "Đã cảnh cáo" : "Bình thường")}</span></td>
            <td class="user-actions-cell"></td>
        `;
        const actionsCell = tr.querySelector(".user-actions-cell");
        if (actionsCell) {
            actionsCell.appendChild(buildUserActionButtons(user.id));
        }
        usersBody.appendChild(tr);
    });

    if (!data?.companions?.length) {
        renderEmptyRow(companionsBody, 5, "Không có companion phù hợp.");
    }
    data.companions.forEach((companion) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${companion.id}</td>
            <td>${escapeHtml(companion.username)}</td>
            <td>${escapeHtml(companion.status)}</td>
            <td>${escapeHtml(companion.flag)}</td>
            <td>${escapeHtml(companion.bio || "")}</td>
        `;
        companionsBody.appendChild(tr);
    });

    usersBody.querySelectorAll('button[data-action="warn"]').forEach((btn) => {
        btn.addEventListener("click", () => updateUserFlag(btn.dataset.id, "warn"));
    });
    usersBody.querySelectorAll('button[data-action="ban"]').forEach((btn) => {
        btn.addEventListener("click", () => updateUserFlag(btn.dataset.id, "ban"));
    });
    usersBody.querySelectorAll('button[data-action="reset-status"]').forEach((btn) => {
        btn.addEventListener("click", () => updateUserFlag(btn.dataset.id, "reset-status"));
    });
}

async function updateUserFlag(userId, action) {
    let endpoint = "ban";
    let method = "POST";
    let successMessage = "Đã khóa tài khoản.";

    if (action === "warn") {
        endpoint = "warn";
        successMessage = "Đã cảnh cáo tài khoản.";
    } else if (action === "reset-status") {
        const confirmed = window.confirm("Bạn có chắc chắn muốn khôi phục trạng thái bình thường cho người dùng này không?");
        if (!confirmed) {
            return;
        }
        endpoint = "reset-status";
        method = "PUT";
        successMessage = "Đã khôi phục trạng thái bình thường cho tài khoản.";
    }

    await requestJson(`/api/admin/users/${userId}/${endpoint}`, { method });
    showAlert(successMessage);
    await loadUsersPage();
}

async function loadModerationPage(keyword) {
    const k = keyword !== undefined && keyword !== null ? String(keyword).trim() : getPageSearchKeyword();
    await loadPendingCompanions("moderation-pending-body", k);

    const reviewsBody = document.getElementById("reviews-body");
    if (!reviewsBody) return;
    const rq = k ? `?keyword=${encodeURIComponent(k)}` : "";
    const reviews = await requestJson(`/api/admin/moderation/reviews${rq}`);
    reviewsBody.innerHTML = "";
    if (!reviews.length) {
        renderEmptyRow(reviewsBody, 6, "Không có review cần xử lý.");
        return;
    }

    reviews.forEach((review) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${review.id}</td>
            <td>${review.bookingId || ""}</td>
            <td>${review.rating || ""}</td>
            <td>${escapeHtml(review.comment || "")}</td>
            <td><span class="badge ${review.hidden ? "text-bg-danger" : "text-bg-success"}">${review.hidden ? "Đã ẩn" : "Hiển thị"}</span></td>
            <td>
                <button class="btn btn-sm btn-outline-danger" ${review.hidden ? "disabled" : ""} data-id="${review.id}">Ẩn bình luận</button>
            </td>
        `;
        reviewsBody.appendChild(tr);
    });

    reviewsBody.querySelectorAll("button[data-id]").forEach((btn) => {
        btn.addEventListener("click", () => hideReview(btn.dataset.id));
    });
}

async function hideReview(reviewId) {
    await requestJson(`/api/admin/moderation/reviews/${reviewId}/hide`, { method: "POST" });
    showAlert("Đã ẩn review vi phạm.");
    await loadModerationPage();
}

async function loadTransactionsPage(keyword) {
    const k = keyword !== undefined && keyword !== null ? String(keyword).trim() : getPageSearchKeyword();
    const q = k ? `?keyword=${encodeURIComponent(k)}` : "";
    const data = await requestJson(`/api/admin/transactions${q}`);
    const commissionInput = document.getElementById("commission-rate");
    if (commissionInput) {
        commissionInput.value = data.commissionRate ?? 0.15;
    }

    const tbody = document.getElementById("withdrawals-body");
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!data.pendingWithdrawals.length) {
        renderEmptyRow(tbody, 9, "Không có lệnh rút tiền chờ duyệt.");
        return;
    }

    data.pendingWithdrawals.forEach((item) => {
        const tr = document.createElement("tr");
        const comm = item.commissionAmount != null ? formatMoney(item.commissionAmount) : "—";
        const net = item.netAmount != null ? formatMoney(item.netAmount) : formatMoney(item.amount);
        tr.innerHTML = `
            <td>${item.id}</td>
            <td>${escapeHtml(item.companionName || "")}</td>
            <td>${escapeHtml(item.bankName || "")}</td>
            <td>${escapeHtml(item.bankAccountNumber || "")}</td>
            <td>${formatMoney(item.amount)}</td>
            <td>${comm}</td>
            <td>${net}</td>
            <td><span class="badge text-bg-warning">${escapeHtml(item.status)}</span></td>
            <td>
                <button class="btn btn-sm btn-success me-1" data-action="approve" data-id="${item.id}">Duyệt</button>
                <button class="btn btn-sm btn-danger" data-action="reject" data-id="${item.id}">Từ chối</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('button[data-action="approve"]').forEach((btn) => {
        btn.addEventListener("click", () => reviewWithdrawal(btn.dataset.id, true));
    });
    tbody.querySelectorAll('button[data-action="reject"]').forEach((btn) => {
        btn.addEventListener("click", () => reviewWithdrawal(btn.dataset.id, false));
    });
}

async function reviewWithdrawal(id, approve) {
    const url = approve
        ? `/api/admin/transactions/withdrawals/${id}/approve`
        : `/api/admin/transactions/withdrawals/${id}/reject`;
    await requestJson(url, { method: "POST" });
    showAlert(approve ? "Đã duyệt lệnh rút tiền." : "Đã từ chối lệnh rút tiền.");
    await loadTransactionsPage();
}

async function saveCommissionRate(event) {
    event.preventDefault();
    const value = Number(document.getElementById("commission-rate").value);
    await requestJson("/api/admin/transactions/commission-rate", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commissionRate: value })
    });
    showAlert("Đã cập nhật tỷ lệ hoa hồng.");
    await loadTransactionsPage();
}

async function loadDisputesPage() {
    const disputes = await requestJson("/api/admin/disputes");
    const tbody = document.getElementById("disputes-body");
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!disputes || !disputes.length) {
        renderEmptyRow(tbody, 6, "Không có tranh chấp.");
        return;
    }

    disputes.forEach((dispute) => {
        const tr = document.createElement("tr");
        tr.setAttribute("data-report-id", String(dispute.id));
        const statusBadgeClass =
            dispute.status === "RESOLVED"
                ? "text-bg-success"
                : dispute.status === "ESCROW_FROZEN"
                  ? "text-bg-info"
                  : "text-bg-warning";
        const disableAllActions = dispute.status === "RESOLVED";
        const disableFreezeAction = dispute.status === "ESCROW_FROZEN" || disableAllActions;
        tr.innerHTML = `
            <td>${dispute.id}</td>
            <td>${escapeHtml(dispute.reporter || "")}</td>
            <td>${escapeHtml(dispute.reportedUser || "")}</td>
            <td>${escapeHtml(dispute.reason || "")}</td>
            <td>
                <span class="badge ${statusBadgeClass}" data-cy="dispute-status-badge">${escapeHtml(dispute.status)}</span>
                ${
                    dispute.lastAction && dispute.lastAction !== "NONE"
                        ? `<div class="small text-muted mt-1" data-cy="dispute-last-action">${escapeHtml(dispute.lastAction)}</div>`
                        : ""
                }
            </td>
            <td class="action-group">
                <button type="button" class="btn btn-sm btn-secondary" data-cy="btn-dispute-freeze" data-action="freeze" data-report-id="${dispute.id}" ${disableFreezeAction ? "disabled" : ""}>Đóng băng ký quỹ</button>
                <button type="button" class="btn btn-sm btn-outline-primary" data-cy="btn-dispute-refund" data-action="refund" data-report-id="${dispute.id}" ${disableAllActions ? "disabled" : ""}>Hoàn tiền</button>
                <button type="button" class="btn btn-sm btn-outline-success" data-cy="btn-dispute-payout" data-action="payout" data-report-id="${dispute.id}" ${disableAllActions ? "disabled" : ""}>Thanh toán</button>
                <button type="button" class="btn btn-sm btn-dark" data-cy="btn-dispute-close" data-action="close" data-report-id="${dispute.id}" ${disableAllActions ? "disabled" : ""}>Đóng hồ sơ</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('button[data-action][data-report-id]').forEach((btn) => {
        btn.addEventListener("click", () => {
            const reportId = btn.getAttribute("data-report-id");
            const action = btn.getAttribute("data-action");
            processDispute(reportId, action);
        });
    });
}

async function processDispute(id, action) {
    const map = {
        freeze: "freeze-escrow",
        refund: "refund",
        payout: "payout",
        close: "close"
    };
    const endpoint = map[action];
    if (!id || !endpoint) {
        showAlert("Thiếu thông tin hành động.", "danger");
        return;
    }
    try {
        const res = await requestJson(`/api/admin/disputes/${encodeURIComponent(id)}/${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        });
        const status = res?.status || (action === "freeze" ? "ESCROW_FROZEN" : "RESOLVED");
        const lastAction = res?.action || null;

        const row = document.querySelector(`tr[data-report-id="${String(id)}"]`);
        if (row) {
            const badge = row.querySelector('[data-cy="dispute-status-badge"]');
            if (badge) {
                badge.textContent = String(status);
                badge.classList.remove("text-bg-success", "text-bg-warning", "text-bg-info");
                if (status === "RESOLVED") {
                    badge.classList.add("text-bg-success");
                } else if (status === "ESCROW_FROZEN") {
                    badge.classList.add("text-bg-info");
                } else {
                    badge.classList.add("text-bg-warning");
                }
            }

            const lastActionEl = row.querySelector('[data-cy="dispute-last-action"]');
            if (lastAction && lastAction !== "NONE") {
                if (lastActionEl) {
                    lastActionEl.textContent = String(lastAction);
                } else {
                    const statusCell = badge?.parentElement;
                    if (statusCell) {
                        const div = document.createElement("div");
                        div.className = "small text-muted mt-1";
                        div.setAttribute("data-cy", "dispute-last-action");
                        div.textContent = String(lastAction);
                        statusCell.appendChild(div);
                    }
                }
            } else {
                lastActionEl?.remove();
            }

            // Freeze là trạng thái trung gian, chỉ disable nút Freeze.
            // Còn các hành động kết thúc (refund/payout/close) thì disable toàn bộ nút.
            const btns = row.querySelectorAll('button[data-action]');
            btns.forEach((btn) => {
                const a = btn.getAttribute("data-action");
                btn.disabled = action === "freeze" ? a === "freeze" : true;
            });
        } else {
            await loadDisputesPage();
        }

        showAlert(res?.message || "Đã cập nhật xử lý tranh chấp.");
    } catch (err) {
        showAlert(err?.message || "Thao tác thất bại.", "danger");
    }
}

const adminTrackingState = {
    map: null,
    markersLayer: null,
    trailLayer: null,
    liveMarker: null,
    subscription: null,
    pollTimer: null,
    trailCoords: [],
    selectedId: null,
};

function teardownAdminTrackingLive() {
    if (adminTrackingState.subscription && typeof adminTrackingState.subscription.unsubscribe === "function") {
        try {
            adminTrackingState.subscription.unsubscribe();
        } catch (_) {
            /* ignore */
        }
    }
    adminTrackingState.subscription = null;
    if (adminTrackingState.pollTimer) {
        clearInterval(adminTrackingState.pollTimer);
        adminTrackingState.pollTimer = null;
    }
}

function ensureAdminTrackingMap() {
    if (adminTrackingState.map || typeof L === "undefined") {
        return;
    }
    const el = document.getElementById("admin-tracking-map");
    if (!el) {
        return;
    }
    adminTrackingState.map = L.map("admin-tracking-map").setView([10.762622, 106.660172], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
    }).addTo(adminTrackingState.map);
    adminTrackingState.markersLayer = L.layerGroup().addTo(adminTrackingState.map);
}

function clearAdminTrackingMapLayers() {
    if (adminTrackingState.markersLayer) {
        adminTrackingState.markersLayer.clearLayers();
    }
    if (adminTrackingState.trailLayer && adminTrackingState.map) {
        adminTrackingState.map.removeLayer(adminTrackingState.trailLayer);
        adminTrackingState.trailLayer = null;
    }
    adminTrackingState.liveMarker = null;
    adminTrackingState.trailCoords = [];
}

function addAdminTrackingCircleMarker(lat, lng, color, label) {
    if (lat == null || lng == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) {
        return null;
    }
    const m = L.circleMarker([Number(lat), Number(lng)], {
        radius: 9,
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.35,
    });
    m.bindPopup(label);
    m.addTo(adminTrackingState.markersLayer);
    return m;
}

function renderAdminTrackingDetail(detail) {
    const info = document.getElementById("admin-tracking-detail");
    if (!info) {
        return;
    }
    const st = detail.status || "";
    const cIn = detail.customerCheckIn || {};
    const pIn = detail.companionCheckIn || {};
    const merged = detail.mergedCheckIn || {};
    const live = detail.live || {};
    const cOut = detail.customerCheckOut || {};
    const pOut = detail.companionCheckOut || {};
    const co = detail.checkOut || {};
    info.innerHTML = `
        <div class="small">
            <div><strong>Đơn #${detail.id}</strong> · <span class="badge text-bg-secondary">${escapeHtml(st)}</span></div>
            <div class="text-muted mt-1">Khách: ${escapeHtml(detail.customerUsername || "")} · Companion: ${escapeHtml(
        detail.companionUsername || ""
    )}</div>
            <div class="mt-2"><strong>Điểm check-in</strong></div>
            <ul class="mb-1 ps-3">
                <li>Khách: ${cIn.set ? `${Number(cIn.latitude).toFixed(5)}, ${Number(cIn.longitude).toFixed(5)}` : "chưa có"}</li>
                <li>Companion: ${pIn.set ? `${Number(pIn.latitude).toFixed(5)}, ${Number(pIn.longitude).toFixed(5)}` : "chưa có"}</li>
                <li>Sau đối chiếu (điểm hẹn): ${merged.set ? `${Number(merged.latitude).toFixed(5)}, ${Number(merged.longitude).toFixed(5)}` : "chưa có"}</li>
            </ul>
            <div class="mt-2"><strong>Điểm check-out</strong></div>
            <ul class="mb-1 ps-3">
                <li>Khách: ${cOut.set ? `${Number(cOut.latitude).toFixed(5)}, ${Number(cOut.longitude).toFixed(5)}` : "chưa có"}</li>
                <li>Companion: ${pOut.set ? `${Number(pOut.latitude).toFixed(5)}, ${Number(pOut.longitude).toFixed(5)}` : "chưa có"}</li>
                <li>Sau đối chiếu (hoàn tất): ${co.set ? `${Number(co.latitude).toFixed(5)}, ${Number(co.longitude).toFixed(5)}` : "chưa có"}</li>
            </ul>
            <div><strong>Vị trí live gần nhất</strong>: ${
                live.latitude != null && live.longitude != null
                    ? `${Number(live.latitude).toFixed(5)}, ${Number(live.longitude).toFixed(5)} (${escapeHtml(live.role || "")})`
                    : "chưa có"
            }</div>
        </div>
    `;
}

function fitAdminTrackingBoundsFromDetail(detail) {
    const pts = [];
    const push = (lat, lng) => {
        if (lat != null && lng != null && !Number.isNaN(Number(lat)) && !Number.isNaN(Number(lng))) {
            pts.push([Number(lat), Number(lng)]);
        }
    };
    const cIn = detail.customerCheckIn || {};
    const pIn = detail.companionCheckIn || {};
    const merged = detail.mergedCheckIn || {};
    const live = detail.live || {};
    const cOut = detail.customerCheckOut || {};
    const pOut = detail.companionCheckOut || {};
    const co = detail.checkOut || {};
    push(cIn.latitude, cIn.longitude);
    push(pIn.latitude, pIn.longitude);
    push(merged.latitude, merged.longitude);
    push(live.latitude, live.longitude);
    push(cOut.latitude, cOut.longitude);
    push(pOut.latitude, pOut.longitude);
    push(co.latitude, co.longitude);
    if (!pts.length || !adminTrackingState.map) {
        return;
    }
    if (pts.length === 1) {
        adminTrackingState.map.setView(pts[0], 15);
    } else {
        adminTrackingState.map.fitBounds(pts, { padding: [40, 40], maxZoom: 16 });
    }
}

function drawAdminTrackingStaticMarkers(detail) {
    clearAdminTrackingMapLayers();
    const cIn = detail.customerCheckIn || {};
    const pIn = detail.companionCheckIn || {};
    const merged = detail.mergedCheckIn || {};
    const live = detail.live || {};
    const cOut = detail.customerCheckOut || {};
    const pOut = detail.companionCheckOut || {};
    const co = detail.checkOut || {};
    addAdminTrackingCircleMarker(cIn.latitude, cIn.longitude, "#2563eb", "Check-in khách");
    addAdminTrackingCircleMarker(pIn.latitude, pIn.longitude, "#16a34a", "Check-in companion");
    addAdminTrackingCircleMarker(merged.latitude, merged.longitude, "#7c3aed", "Điểm hẹn sau đối chiếu");
    addAdminTrackingCircleMarker(cOut.latitude, cOut.longitude, "#f97316", "Check-out khách");
    addAdminTrackingCircleMarker(pOut.latitude, pOut.longitude, "#c2410c", "Check-out companion");
    addAdminTrackingCircleMarker(co.latitude, co.longitude, "#64748b", "Check-out sau đối chiếu");
    if (live.latitude != null && live.longitude != null) {
        adminTrackingState.liveMarker = L.circleMarker([Number(live.latitude), Number(live.longitude)], {
            radius: 10,
            color: "#dc2626",
            weight: 3,
            fillColor: "#fecaca",
            fillOpacity: 0.9,
        });
        adminTrackingState.liveMarker.bindPopup("Vị trí live (WebSocket + làm mới định kỳ)");
        adminTrackingState.liveMarker.addTo(adminTrackingState.markersLayer);
        adminTrackingState.trailCoords.push([Number(live.latitude), Number(live.longitude)]);
        adminTrackingState.trailLayer = L.polyline(adminTrackingState.trailCoords, {
            color: "#f97316",
            weight: 3,
            opacity: 0.85,
        }).addTo(adminTrackingState.map);
    }
    fitAdminTrackingBoundsFromDetail(detail);
}

function appendAdminTrackingTrail(lat, lng) {
    if (lat == null || lng == null || !adminTrackingState.map) {
        return;
    }
    const la = Number(lat);
    const ln = Number(lng);
    if (Number.isNaN(la) || Number.isNaN(ln)) {
        return;
    }
    adminTrackingState.trailCoords.push([la, ln]);
    if (adminTrackingState.trailLayer) {
        adminTrackingState.map.removeLayer(adminTrackingState.trailLayer);
    }
    adminTrackingState.trailLayer = L.polyline(adminTrackingState.trailCoords, {
        color: "#f97316",
        weight: 3,
        opacity: 0.85,
    }).addTo(adminTrackingState.map);
    if (adminTrackingState.liveMarker) {
        adminTrackingState.liveMarker.setLatLng([la, ln]);
    } else {
        adminTrackingState.liveMarker = L.circleMarker([la, ln], {
            radius: 10,
            color: "#dc2626",
            weight: 3,
            fillColor: "#fecaca",
            fillOpacity: 0.9,
        });
        adminTrackingState.liveMarker.bindPopup("Vị trí live");
        adminTrackingState.liveMarker.addTo(adminTrackingState.markersLayer);
    }
}

async function subscribeAdminBookingLocation(bookingId) {
    teardownAdminTrackingLive();
    if (typeof RealtimeStomp === "undefined" || !RealtimeStomp.subscribeBookingLocation) {
        return;
    }
    try {
        adminTrackingState.subscription = await RealtimeStomp.subscribeBookingLocation(bookingId, (payload) => {
            if (!payload || Number(payload.bookingId) !== Number(bookingId)) {
                return;
            }
            appendAdminTrackingTrail(payload.latitude, payload.longitude);
        });
    } catch (e) {
        console.warn("STOMP subscribe failed", e);
    }
    adminTrackingState.pollTimer = setInterval(async () => {
        try {
            if (!adminTrackingState.selectedId) {
                return;
            }
            const d = await requestJson(`/api/admin/bookings/${adminTrackingState.selectedId}/tracking`);
            renderAdminTrackingDetail(d);
        } catch (_) {
            /* ignore */
        }
    }, 12000);
}

async function selectBookingForTracking(bookingId) {
    adminTrackingState.selectedId = bookingId;
    const sid = document.getElementById("admin-tracking-selected-id");
    if (sid) {
        sid.textContent = String(bookingId);
    }
    const detail = await requestJson(`/api/admin/bookings/${bookingId}/tracking`);
    renderAdminTrackingDetail(detail);
    ensureAdminTrackingMap();
    drawAdminTrackingStaticMarkers(detail);
    await subscribeAdminBookingLocation(bookingId);
}

async function loadAdminTrackingList() {
    const tbody = document.getElementById("admin-tracking-body");
    if (!tbody) {
        return;
    }
    const rows = await requestJson("/api/admin/bookings/tracking");
    tbody.innerHTML = "";
    if (!rows || !rows.length) {
        tbody.innerHTML =
            '<tr><td colspan="7" class="text-center text-muted">Không có đơn ACCEPTED / IN_PROGRESS.</td></tr>';
        return;
    }
    rows.forEach((r) => {
        const tr = document.createElement("tr");
        tr.style.cursor = "pointer";
        const hasLive = r.liveLatitude != null && r.liveLongitude != null;
        tr.innerHTML = `
            <td>${r.id}</td>
            <td><span class="badge ${r.status === "IN_PROGRESS" ? "text-bg-success" : "text-bg-warning"}">${escapeHtml(
            r.status
        )}</span></td>
            <td>${escapeHtml(r.customerUsername || "")}</td>
            <td>${escapeHtml(r.companionUsername || "")}</td>
            <td>${escapeHtml(r.bookingTime || "")}</td>
            <td>${escapeHtml(r.rentalVenue || "")}</td>
            <td>${hasLive ? '<span class="text-success">Có</span>' : '<span class="text-muted">—</span>'}</td>
        `;
        tr.addEventListener("click", () => {
            selectBookingForTracking(r.id).catch((e) => console.error(e));
        });
        tbody.appendChild(tr);
    });
}

async function initAdminTrackingPage() {
    ensureAdminTrackingMap();
    await loadAdminTrackingList();
    if (adminTrackingState.map) {
        setTimeout(() => adminTrackingState.map.invalidateSize(), 250);
    }
}

function notifIcon(title) {
    const t = (title || "").toLowerCase();
    if (t.includes("booking") || t.includes("đặt lịch"))
        return { icon: "bi-calendar-event-fill", bg: "linear-gradient(135deg, #3b82f6, #6366f1)" };
    if (t.includes("thanh toán") || t.includes("tiền") || t.includes("rút") || t.includes("hoa hồng"))
        return { icon: "bi-wallet2", bg: "linear-gradient(135deg, #10b981, #059669)" };
    if (t.includes("đánh giá") || t.includes("review"))
        return { icon: "bi-star-fill", bg: "linear-gradient(135deg, #f59e0b, #f97316)" };
    if (t.includes("báo cáo") || t.includes("report") || t.includes("sos") || t.includes("tranh chấp"))
        return { icon: "bi-exclamation-triangle-fill", bg: "linear-gradient(135deg, #ef4444, #dc2626)" };
    if (t.includes("duyệt") || t.includes("companion") || t.includes("hồ sơ"))
        return { icon: "bi-person-check-fill", bg: "linear-gradient(135deg, #8b5cf6, #a78bfa)" };
    if (t.includes("người dùng") || t.includes("user") || t.includes("đăng ký"))
        return { icon: "bi-people-fill", bg: "linear-gradient(135deg, #06b6d4, #0891b2)" };
    return { icon: "bi-bell-fill", bg: "linear-gradient(135deg, #64748b, #94a3b8)" };
}

function fmtDateTimeAdmin(value) {
    if (!value) return "";
    return new Date(value).toLocaleString("vi-VN");
}

const adminRealtimeNotifState = {
    initialized: false,
    seenIds: new Set(),
    timer: null
};

function getAdminToastContainer() {
    let box = document.getElementById("admin-realtime-toast-container");
    if (box) return box;
    box = document.createElement("div");
    box.id = "admin-realtime-toast-container";
    box.style.cssText = "position:fixed;top:16px;right:16px;z-index:1085;display:flex;flex-direction:column;gap:8px;max-width:380px;";
    document.body.appendChild(box);
    return box;
}

function showAdminToast(notification) {
    const box = getAdminToastContainer();
    const item = document.createElement("div");
    item.className = "shadow rounded-3 border bg-white p-3";
    const isSos = isSosNotification(notification);
    const bodyInner = isSos
        ? formatSosNotificationContentHtml(notification.content || "")
        : `<div class="small text-muted" style="white-space:pre-wrap;word-break:break-word;">${escapeHtml(notification.content || "")}</div>`;
    item.innerHTML = `
        <div class="fw-semibold mb-1"><i class="bi bi-bell-fill text-primary me-2"></i>${escapeHtml(notification.title || "Thông báo mới")}</div>
        ${isSos ? `<div class="small text-body">${bodyInner}</div>` : bodyInner}
    `;
    box.appendChild(item);
    setTimeout(() => item.remove(), 5000);
}

function showAdminSosAlarm(notification) {
    const old = document.getElementById("admin-sos-overlay");
    if (old) old.remove();
    const overlay = document.createElement("div");
    overlay.id = "admin-sos-overlay";
    overlay.style.cssText = "position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px;";
    const bodyHtml = formatSosNotificationContentHtml(notification.content || "");
    overlay.innerHTML = `
        <div class="bg-white rounded-4 shadow p-4" style="max-width:560px;width:100%;border:4px solid #ef4444;animation:sos-pulse .9s infinite alternate;">
            <div class="text-center">
                <div class="display-6 text-danger mb-2"><i class="bi bi-exclamation-octagon-fill"></i></div>
                <h3 class="h4 fw-bold text-danger mb-2">CẢNH BÁO SOS KHẨN CẤP</h3>
                <div class="fw-semibold mb-3 text-body">${escapeHtml(notification.title || "SOS")}</div>
            </div>
            <div class="text-start small text-body mb-3 sos-modal-body" style="max-height:min(52vh,380px);overflow:auto;line-height:1.45;">${bodyHtml}</div>
            <div class="text-center pt-1">
                <button id="admin-sos-close-btn" class="btn btn-danger px-4">Đã nhận cảnh báo</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    if (!document.getElementById("admin-sos-style")) {
        const style = document.createElement("style");
        style.id = "admin-sos-style";
        style.textContent = "@keyframes sos-pulse{from{transform:scale(1)}to{transform:scale(1.03)}}";
        document.head.appendChild(style);
    }
    document.getElementById("admin-sos-close-btn")?.addEventListener("click", () => overlay.remove());
}

function isSosNotification(notification) {
    const text = `${notification?.title || ""} ${notification?.content || ""}`.toLowerCase();
    return text.includes("sos") || text.includes("khẩn") || text.includes("bao dong") || text.includes("báo động");
}

function processAdminRealtimeNotifications(list) {
    const sorted = [...(Array.isArray(list) ? list : [])]
        .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    if (!adminRealtimeNotifState.initialized) {
        sorted.forEach((n) => adminRealtimeNotifState.seenIds.add(Number(n.id)));
        adminRealtimeNotifState.initialized = true;
        return;
    }
    sorted.forEach((n) => {
        const id = Number(n.id);
        if (!adminRealtimeNotifState.seenIds.has(id)) {
            adminRealtimeNotifState.seenIds.add(id);
            if (isSosNotification(n)) {
                showAdminSosAlarm(n);
            } else {
                showAdminToast(n);
            }
        }
    });
}

async function pollAdminRealtimeNotifications() {
    try {
        const list = await requestJson("/api/admin/notifications/me");
        processAdminRealtimeNotifications(list);
    } catch (_) {
        // avoid blocking admin dashboard on transient errors
    }
}

async function loadAdminNotifications() {
    const listBox = document.getElementById("notification-list");
    const countBadge = document.getElementById("unread-count");
    const markAllBtn = document.getElementById("mark-all-read-btn");
    if (!listBox) return;

    async function render() {
        const list = await requestJson("/api/admin/notifications/me");
        const unread = list.filter(n => !n.isRead).length;
        if (countBadge) countBadge.textContent = `${unread} chưa đọc`;

        if (!list.length) {
            listBox.innerHTML = `
                <div class="text-center py-5">
                    <i class="bi bi-bell-slash text-muted" style="font-size: 3rem;"></i>
                    <p class="text-muted mt-3 mb-0">Không có thông báo</p>
                </div>`;
            return;
        }

        listBox.innerHTML = list.map(n => {
            const ic = notifIcon(n.title);
            const timeStr = fmtDateTimeAdmin(n.createdAt);
            return `
            <div class="notif-item d-flex gap-3 align-items-start ${n.isRead ? "" : "unread"}" data-id="${n.id}" data-read="${n.isRead}">
                <div class="notif-icon text-white" style="background: ${ic.bg};">
                    <i class="bi ${ic.icon}"></i>
                </div>
                <div class="flex-grow-1">
                    <div class="d-flex justify-content-between align-items-start">
                        <div class="notif-title">${escapeHtml(n.title)}</div>
                        ${!n.isRead ? '<span class="notif-dot ms-2 mt-2"></span>' : ""}
                    </div>
                    <div class="small mt-1 admin-notif-body ${(n.title || "").toLowerCase().includes("sos") ? "text-body" : "text-muted"}">${(n.title || "").toLowerCase().includes("sos") ? formatSosNotificationContentHtml(n.content || "") : escapeHtml(n.content || "")}</div>
                    <div class="notif-time mt-1"><i class="bi bi-clock me-1"></i>${timeStr}</div>
                </div>
            </div>`;
        }).join("");

        listBox.querySelectorAll('.notif-item[data-read="false"]').forEach(item => {
            item.addEventListener("click", async () => {
                const id = item.getAttribute("data-id");
                await fetch(`/api/admin/notifications/${id}/read`, { method: "PATCH" });
                item.classList.remove("unread");
                item.setAttribute("data-read", "true");
                const dot = item.querySelector(".notif-dot");
                if (dot) dot.remove();
                const refreshed = await requestJson("/api/admin/notifications/me");
                const u = refreshed.filter(nn => !nn.isRead).length;
                if (countBadge) countBadge.textContent = `${u} chưa đọc`;
            });
        });
    }

    if (markAllBtn) {
        markAllBtn.addEventListener("click", async () => {
            await fetch("/api/admin/notifications/read-all", { method: "PATCH" });
            await render();
        });
    }

    await render();
}

function setupPageEvents() {
    const path = window.location.pathname;
    if (path.endsWith("/dashboard.html")) {
        document.getElementById("reload-pending-btn")?.addEventListener("click", async () => {
            clearAlert();
            clearPageSearchKeyword();
            await loadDashboardStats();
            await loadPendingCompanions("pending-body", "");
            adminChartState.payload = null;
            await loadAdminDashboardCharts();
            showAlert("Đã tải lại dữ liệu.", "success");
        });
        document.getElementById("admin-chart-range")?.addEventListener("change", async (e) => {
            adminChartState.range = e.target.value;
            await loadAdminDashboardCharts();
        });
    }
    if (path.endsWith("/users.html")) {
        document.getElementById("reload-users-btn")?.addEventListener("click", async () => {
            clearAlert();
            clearPageSearchKeyword();
            await loadUsersPage("");
            showAlert("Đã tải lại danh sách.", "success");
        });
        wireAdminSearch(() => loadUsersPage());
    }
    if (path.endsWith("/moderation.html")) {
        document.getElementById("reload-moderation-btn")?.addEventListener("click", async () => {
            clearAlert();
            clearPageSearchKeyword();
            await loadModerationPage("");
            showAlert("Đã tải lại danh sách.", "success");
        });
        wireAdminSearch(() => loadModerationPage());
    }
    if (path.endsWith("/transactions.html")) {
        document.getElementById("reload-transactions-btn")?.addEventListener("click", async () => {
            clearAlert();
            clearPageSearchKeyword();
            await loadTransactionsPage("");
            showAlert("Đã tải lại danh sách.", "success");
        });
        wireAdminSearch(() => loadTransactionsPage());
        document.getElementById("commission-form")?.addEventListener("submit", saveCommissionRate);
    }
    if (path.endsWith("/tracking.html")) {
        document.getElementById("reload-tracking-btn")?.addEventListener("click", async () => {
            clearAlert();
            await loadAdminTrackingList();
            if (adminTrackingState.selectedId) {
                await selectBookingForTracking(adminTrackingState.selectedId);
            }
            showAlert("Đã tải lại danh sách.", "success");
        });
    }
    if (path.endsWith("/disputes.html")) {
        document.getElementById("reload-disputes-btn")?.addEventListener("click", async () => {
            clearAlert();
            await loadDisputesPage();
            showAlert("Đã tải lại danh sách.", "success");
        });
    }
}

async function bootstrapAdminPage() {
    bindLogout();
    setupPageEvents();
    await pollAdminRealtimeNotifications();
    if (!adminRealtimeNotifState.timer) {
        adminRealtimeNotifState.timer = setInterval(pollAdminRealtimeNotifications, 4000);
    }

    const path = window.location.pathname;
    if (path.endsWith("/dashboard.html")) {
        await loadDashboardStats();
        await loadPendingCompanions("pending-body");
        await loadAdminDashboardCharts();
    } else if (path.endsWith("/users.html")) {
        await loadUsersPage();
    } else if (path.endsWith("/moderation.html")) {
        await loadModerationPage();
    } else if (path.endsWith("/transactions.html")) {
        await loadTransactionsPage();
    } else if (path.endsWith("/tracking.html")) {
        await initAdminTrackingPage();
    } else if (path.endsWith("/disputes.html")) {
        await loadDisputesPage();
    } else if (path.endsWith("/notifications.html")) {
        await loadAdminNotifications();
    }
}

ensureAdminAccess().then((allowed) => {
    if (!allowed) {
        return;
    }
    bootstrapAdminPage().catch((error) => {
        console.error(error);
        showAlert("Không thể tải dữ liệu admin. Vui lòng thử lại.", "danger");
    });
});
