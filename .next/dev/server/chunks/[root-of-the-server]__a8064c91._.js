module.exports = [
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/crypto [external] (crypto, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("crypto", () => require("crypto"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/action-async-storage.external.js [external] (next/dist/server/app-render/action-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/app-render/action-async-storage.external.js", () => require("next/dist/server/app-render/action-async-storage.external.js"));

module.exports = mod;
}),
"[project]/lib/db.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "executeSequential",
    ()=>executeSequential,
    "query",
    ()=>query,
    "sql",
    ()=>sql
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f40$neondatabase$2b$serverless$40$0$2e$10$2e$4$2f$node_modules$2f40$neondatabase$2f$serverless$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/@neondatabase+serverless@0.10.4/node_modules/@neondatabase/serverless/index.mjs [app-route] (ecmascript)");
;
if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
}
const rawSql = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f40$neondatabase$2b$serverless$40$0$2e$10$2e$4$2f$node_modules$2f40$neondatabase$2f$serverless$2f$index$2e$mjs__$5b$app$2d$route$5d$__$28$ecmascript$29$__["neon"])(process.env.DATABASE_URL);
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;
async function withRetry(fn) {
    for(let attempt = 1; attempt <= MAX_RETRIES; attempt++){
        try {
            return await fn();
        } catch (error) {
            const isNetworkError = error?.sourceError?.code === 'ETIMEDOUT' || error?.sourceError?.message === 'fetch failed' || error?.message?.includes('fetch failed') || error?.message?.includes('ETIMEDOUT');
            if (isNetworkError && attempt < MAX_RETRIES) {
                console.warn(`[DB] Retry ${attempt}/${MAX_RETRIES} after network error`);
                await new Promise((r)=>setTimeout(r, RETRY_DELAY_MS * attempt));
                continue;
            }
            throw error;
        }
    }
    throw new Error('Unreachable');
}
const sql = (stringsOrQuery, ...values)=>{
    return withRetry(()=>rawSql(stringsOrQuery, ...values));
};
async function query(queryText, ...values) {
    const result = await sql(queryText, ...values);
    return result;
}
async function executeSequential(statements) {
    for (const statement of statements){
        await statement();
    }
}
}),
"[project]/lib/auth.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "auth",
    ()=>auth,
    "checkSubscription",
    ()=>checkSubscription,
    "getCompany",
    ()=>getCompany,
    "getRolePermissions",
    ()=>getRolePermissions,
    "handlers",
    ()=>handlers,
    "hasPermission",
    ()=>hasPermission,
    "requirePermission",
    ()=>requirePermission,
    "signIn",
    ()=>signIn,
    "signOut",
    ()=>signOut
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$2d$auth$40$5$2e$0$2e$0$2d$beta$2e$30_next$40$16$2e$1$2e$6_react$2d$dom$40$19$2e$2$2e$4_react$40$19$2e$2$2e$4_$5f$react$40$19$2e$2$2e$4_$5f$react$40$19$2e$2$2e$4$2f$node_modules$2f$next$2d$auth$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/next-auth@5.0.0-beta.30_next@16.1.6_react-dom@19.2.4_react@19.2.4__react@19.2.4__react@19.2.4/node_modules/next-auth/index.js [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$2d$auth$40$5$2e$0$2e$0$2d$beta$2e$30_next$40$16$2e$1$2e$6_react$2d$dom$40$19$2e$2$2e$4_react$40$19$2e$2$2e$4_$5f$react$40$19$2e$2$2e$4_$5f$react$40$19$2e$2$2e$4$2f$node_modules$2f$next$2d$auth$2f$providers$2f$credentials$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/next-auth@5.0.0-beta.30_next@16.1.6_react-dom@19.2.4_react@19.2.4__react@19.2.4__react@19.2.4/node_modules/next-auth/providers/credentials.js [app-route] (ecmascript) <locals>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f40$auth$2b$core$40$0$2e$41$2e$0$2f$node_modules$2f40$auth$2f$core$2f$providers$2f$credentials$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/@auth+core@0.41.0/node_modules/@auth/core/providers/credentials.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$bcryptjs$40$2$2e$4$2e$3$2f$node_modules$2f$bcryptjs$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/bcryptjs@2.4.3/node_modules/bcryptjs/index.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/db.ts [app-route] (ecmascript)");
;
;
;
;
const { handlers, signIn, signOut, auth } = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$2d$auth$40$5$2e$0$2e$0$2d$beta$2e$30_next$40$16$2e$1$2e$6_react$2d$dom$40$19$2e$2$2e$4_react$40$19$2e$2$2e$4_$5f$react$40$19$2e$2$2e$4_$5f$react$40$19$2e$2$2e$4$2f$node_modules$2f$next$2d$auth$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$locals$3e$__["default"])({
    providers: [
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f40$auth$2b$core$40$0$2e$41$2e$0$2f$node_modules$2f40$auth$2f$core$2f$providers$2f$credentials$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["default"])({
            name: 'credentials',
            credentials: {
                email: {
                    label: 'Email',
                    type: 'email'
                },
                password: {
                    label: 'Password',
                    type: 'password'
                }
            },
            async authorize (credentials) {
                if (!credentials?.email || !credentials?.password) {
                    throw new Error('Email et mot de passe requis');
                }
                const users = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sql"]`
          SELECT u.*, c.name as company_name, c.slug as company_slug, c.subscription_status
          FROM users u
          JOIN companies c ON u.company_id = c.id
          WHERE u.email = ${credentials.email}
          AND u.is_active = true
        `;
                const user = users[0];
                if (!user) {
                    throw new Error('Email ou mot de passe incorrect');
                }
                const isValid = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$bcryptjs$40$2$2e$4$2e$3$2f$node_modules$2f$bcryptjs$2f$index$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["compare"])(credentials.password, user.password_hash);
                if (!isValid) {
                    throw new Error('Email ou mot de passe incorrect');
                }
                // Update last login
                await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sql"]`UPDATE users SET last_login_at = NOW() WHERE id = ${user.id}`;
                // Normalize permissions
                let permissions = [];
                if (Array.isArray(user.permissions)) {
                    permissions = user.permissions;
                } else if (typeof user.permissions === 'string') {
                    try {
                        permissions = JSON.parse(user.permissions);
                    } catch  {
                        permissions = [];
                    }
                }
                return {
                    id: user.id,
                    email: user.email,
                    name: user.full_name,
                    role: user.role,
                    permissions,
                    companyId: user.company_id,
                    companyName: user.company_name,
                    companySlug: user.company_slug
                };
            }
        })
    ],
    callbacks: {
        async jwt ({ token, user }) {
            if (user) {
                token.id = user.id;
                token.email = user.email;
                token.name = user.name;
                token.role = user.role;
                token.permissions = user.permissions;
                token.companyId = user.companyId;
                token.companyName = user.companyName;
                token.companySlug = user.companySlug;
            }
            return token;
        },
        async session ({ session, token }) {
            if (session.user) {
                session.user.id = token.id;
                session.user.email = token.email;
                session.user.name = token.name;
                session.user.role = token.role;
                session.user.permissions = token.permissions || [];
                session.user.companyId = token.companyId;
                session.user.companyName = token.companyName;
                session.user.companySlug = token.companySlug;
            }
            return session;
        }
    },
    pages: {
        signIn: '/login',
        error: '/login'
    },
    session: {
        strategy: 'jwt',
        maxAge: 30 * 24 * 60 * 60
    }
});
async function hasPermission(role, permission) {
    const result = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sql"]`
    SELECT 1 FROM role_permissions
    WHERE role = ${role} AND permission = ${permission}
    LIMIT 1
  `;
    return result.length > 0;
}
async function getRolePermissions(role) {
    const permissions = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sql"]`
    SELECT permission FROM role_permissions
    WHERE role = ${role}
    ORDER BY permission
  `;
    return permissions.map((p)=>p.permission);
}
async function requirePermission(role, permission) {
    // Owner always has access
    if (role === 'owner') return true;
    return hasPermission(role, permission);
}
async function getCompany(companyId) {
    const companies = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sql"]`
    SELECT * FROM companies WHERE id = ${companyId}
  `;
    return companies[0] ?? null;
}
async function checkSubscription(companyId) {
    const company = await getCompany(companyId);
    if (!company) {
        return {
            isActive: false,
            status: 'not_found'
        };
    }
    const now = new Date();
    if (company.subscription_status === 'trialing' && company.trial_ends_at) {
        const trialEnds = new Date(company.trial_ends_at);
        const daysRemaining = Math.ceil((trialEnds.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return {
            isActive: daysRemaining > 0,
            status: 'trialing',
            trialEndsAt: trialEnds.toISOString(),
            daysRemaining: Math.max(0, daysRemaining)
        };
    }
    return {
        isActive: company.subscription_status === 'active',
        status: company.subscription_status
    };
}
}),
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
    SELECT c.subscription_status, c.trial_ends_at, c.subscription_ends_at,
           sp.name as plan_name
    FROM companies c
    LEFT JOIN subscription_plans sp ON c.subscription_plan_id = sp.id
    WHERE c.id = ${companyId}
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
        const planName = company.plan_name || 'Abonnement actif';
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
        planName: company.plan_name || null,
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
"[project]/lib/geniuspay.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "PLANS",
    ()=>PLANS,
    "createPayment",
    ()=>createPayment,
    "formatXOF",
    ()=>formatXOF,
    "getPlan",
    ()=>getPlan,
    "getPlanPrice",
    ()=>getPlanPrice,
    "isGeniusPayConfigured",
    ()=>isGeniusPayConfigured,
    "verifyWebhookSignature",
    ()=>verifyWebhookSignature
]);
// ===== Webhook Signature Verification =====
var __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/crypto [external] (crypto, cjs)");
// GeniusPay API Client — https://pay.genius.ci/docs/api
const BASE_URL = process.env.GENIUSPAY_BASE_URL || 'https://pay.genius.ci/api/v1/merchant';
const API_KEY = process.env.GENIUSPAY_API_KEY || '';
const API_SECRET = process.env.GENIUSPAY_API_SECRET || '';
function isGeniusPayConfigured() {
    return API_KEY.length > 5 && API_SECRET.length > 5;
}
async function createPayment(params) {
    const body = {
        amount: params.amount,
        currency: 'XOF',
        description: params.description,
        success_url: params.successUrl,
        error_url: params.errorUrl
    };
    if (params.customerName || params.customerEmail || params.customerPhone) {
        body.customer = {};
        if (params.customerName) body.customer.name = params.customerName;
        if (params.customerEmail) body.customer.email = params.customerEmail;
        if (params.customerPhone) body.customer.phone = params.customerPhone;
    }
    if (params.metadata) {
        body.metadata = params.metadata;
    }
    const res = await fetch(`${BASE_URL}/payments`, {
        method: 'POST',
        headers: {
            'X-API-Key': API_KEY,
            'X-API-Secret': API_SECRET,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`GeniusPay API error (${res.status}): ${errorText}`);
    }
    return res.json();
}
;
function verifyWebhookSignature(payload, signature, timestamp, secret) {
    const data = `${timestamp}.${payload}`;
    const expectedSignature = (0, __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__["createHmac"])('sha256', secret).update(data).digest('hex');
    try {
        return (0, __TURBOPACK__imported__module__$5b$externals$5d2f$crypto__$5b$external$5d$__$28$crypto$2c$__cjs$29$__["timingSafeEqual"])(Buffer.from(expectedSignature), Buffer.from(signature));
    } catch  {
        return false;
    }
}
const PLANS = [
    {
        id: 'essentiel',
        name: 'Pack Essentiel',
        description: 'Pour les petits commerces et dépôts',
        features: [
            'Gestion des ventes',
            'Gestion du stock',
            'Gestion des clients',
            'Factures automatiques',
            'Support email'
        ],
        prices: [
            {
                interval: 'monthly',
                months: 1,
                price: 25000,
                label: '25 000 XOF / mois'
            },
            {
                interval: 'quarterly',
                months: 3,
                price: 70000,
                label: '70 000 XOF / 3 mois'
            },
            {
                interval: 'semiannual',
                months: 6,
                price: 130000,
                label: '130 000 XOF / 6 mois'
            },
            {
                interval: 'yearly',
                months: 12,
                price: 250000,
                label: '250 000 XOF / an'
            }
        ]
    },
    {
        id: 'business',
        name: 'Pack Business',
        description: 'Pour les distributeurs et grossistes',
        popular: true,
        features: [
            'Tout du Pack Essentiel',
            'Multi-dépôts',
            'Rapports avancés',
            'Gestion des tournées',
            'Support prioritaire',
            'Accès API'
        ],
        prices: [
            {
                interval: 'monthly',
                months: 1,
                price: 45000,
                label: '45 000 XOF / mois'
            },
            {
                interval: 'quarterly',
                months: 3,
                price: 130000,
                label: '130 000 XOF / 3 mois'
            },
            {
                interval: 'semiannual',
                months: 6,
                price: 250000,
                label: '250 000 XOF / 6 mois'
            },
            {
                interval: 'yearly',
                months: 12,
                price: 500000,
                label: '500 000 XOF / an'
            }
        ]
    },
    {
        id: 'entreprise',
        name: 'Pack Entreprise',
        description: 'Pour les grandes entreprises — accès complet',
        features: [
            'Tout du Pack Business',
            'Utilisateurs illimités',
            'Dépôts illimités',
            'Branding personnalisé',
            'Formation dédiée',
            'Support dédié 24/7'
        ],
        prices: [
            {
                interval: 'yearly',
                months: 12,
                price: 0,
                label: '0 XOF / an'
            }
        ]
    }
];
function getPlan(planId) {
    return PLANS.find((p)=>p.id === planId);
}
function getPlanPrice(planId, interval) {
    const plan = getPlan(planId);
    if (!plan) return undefined;
    return plan.prices.find((p)=>p.interval === interval);
}
function formatXOF(amount) {
    return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'XOF',
        minimumFractionDigits: 0
    }).format(amount);
}
}),
"[project]/app/api/subscription/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$1$2e$6_react$2d$dom$40$19$2e$2$2e$4_react$40$19$2e$2$2e$4_$5f$react$40$19$2e$2$2e$4$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/next@16.1.6_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/auth.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$subscription$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/subscription.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$geniuspay$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/geniuspay.ts [app-route] (ecmascript)");
;
;
;
;
async function GET() {
    try {
        const session = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["auth"])();
        if (!session?.user?.companyId) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$1$2e$6_react$2d$dom$40$19$2e$2$2e$4_react$40$19$2e$2$2e$4_$5f$react$40$19$2e$2$2e$4$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: 'Non autorisé'
            }, {
                status: 401
            });
        }
        const subscription = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$subscription$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["getSubscriptionInfo"])(session.user.companyId);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$1$2e$6_react$2d$dom$40$19$2e$2$2e$4_react$40$19$2e$2$2e$4_$5f$react$40$19$2e$2$2e$4$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            success: true,
            data: {
                subscription,
                plans: __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$geniuspay$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["PLANS"].map((p)=>({
                        id: p.id,
                        name: p.name,
                        description: p.description,
                        popular: p.popular || false,
                        features: p.features,
                        prices: p.prices.map((pr)=>({
                                interval: pr.interval,
                                months: pr.months,
                                price: pr.price,
                                label: pr.label
                            }))
                    }))
            }
        });
    } catch (error) {
        console.error('Error fetching subscription:', error);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$1$2e$6_react$2d$dom$40$19$2e$2$2e$4_react$40$19$2e$2$2e$4_$5f$react$40$19$2e$2$2e$4$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'Erreur serveur'
        }, {
            status: 500
        });
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__a8064c91._.js.map