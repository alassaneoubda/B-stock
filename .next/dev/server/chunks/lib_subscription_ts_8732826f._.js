module.exports = [
"[project]/lib/subscription.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "activateSubscription",
    ()=>activateSubscription,
    "getSubscriptionInfo",
    ()=>getSubscriptionInfo
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/db.ts [app-route] (ecmascript)");
;
async function getSubscriptionInfo(companyId) {
    const companies = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sql"]`
    SELECT subscription_status, subscription_plan_name,
           trial_ends_at, subscription_ends_at
    FROM companies WHERE id = ${companyId}
  `;
    const company = companies[0];
    if (!company) {
        return {
            isActive: false,
            status: 'not_found',
            planName: null,
            daysRemaining: 0,
            endsAt: null,
            trialEndsAt: null
        };
    }
    const now = new Date();
    // 1. Trialing
    if (company.subscription_status === 'trialing') {
        if (!company.trial_ends_at) {
            return {
                isActive: false,
                status: 'expired',
                planName: 'Free Trial',
                daysRemaining: 0,
                endsAt: null,
                trialEndsAt: null
            };
        }
        const trialEnds = new Date(company.trial_ends_at);
        const diff = trialEnds.getTime() - now.getTime();
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        if (days <= 0) {
            return {
                isActive: false,
                status: 'expired',
                planName: 'Free Trial',
                daysRemaining: 0,
                endsAt: trialEnds.toISOString(),
                trialEndsAt: trialEnds.toISOString()
            };
        }
        return {
            isActive: true,
            status: 'trialing',
            planName: 'Free Trial',
            daysRemaining: days,
            endsAt: trialEnds.toISOString(),
            trialEndsAt: trialEnds.toISOString()
        };
    }
    // 2. Active paid plan
    if (company.subscription_status === 'active') {
        const planName = company.subscription_plan_name || 'Abonnement actif';
        if (!company.subscription_ends_at) {
            // Active without end date = unlimited (e.g. Pack Entreprise free)
            return {
                isActive: true,
                status: 'active',
                planName,
                daysRemaining: 999,
                endsAt: null,
                trialEndsAt: company.trial_ends_at ? new Date(company.trial_ends_at).toISOString() : null
            };
        }
        const endsAt = new Date(company.subscription_ends_at);
        const diff = endsAt.getTime() - now.getTime();
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        if (days <= 0) {
            // Subscription expired
            return {
                isActive: false,
                status: 'expired',
                planName,
                daysRemaining: 0,
                endsAt: endsAt.toISOString(),
                trialEndsAt: company.trial_ends_at ? new Date(company.trial_ends_at).toISOString() : null
            };
        }
        return {
            isActive: true,
            status: 'active',
            planName,
            daysRemaining: days,
            endsAt: endsAt.toISOString(),
            trialEndsAt: company.trial_ends_at ? new Date(company.trial_ends_at).toISOString() : null
        };
    }
    // 3. past_due or canceled
    return {
        isActive: false,
        status: company.subscription_status || 'expired',
        planName: company.subscription_plan_name || null,
        daysRemaining: 0,
        endsAt: company.subscription_ends_at ? new Date(company.subscription_ends_at).toISOString() : null,
        trialEndsAt: company.trial_ends_at ? new Date(company.trial_ends_at).toISOString() : null
    };
}
async function activateSubscription(companyId, planName, months, paymentReference) {
    const endsAt = new Date();
    endsAt.setMonth(endsAt.getMonth() + months);
    await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sql"]`
    UPDATE companies SET
      subscription_status = 'active',
      subscription_plan_name = ${planName},
      subscription_ends_at = ${endsAt.toISOString()},
      stripe_subscription_id = COALESCE(${paymentReference ?? null}, stripe_subscription_id),
      updated_at = NOW()
    WHERE id = ${companyId}
  `;
    return {
        endsAt: endsAt.toISOString()
    };
}
}),
];

//# sourceMappingURL=lib_subscription_ts_8732826f._.js.map