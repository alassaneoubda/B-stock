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
"[project]/lib/cash-automation.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "createCashMovementFromCreditPayment",
    ()=>createCashMovementFromCreditPayment,
    "createCashMovementFromExpense",
    ()=>createCashMovementFromExpense,
    "createCashMovementFromSale",
    ()=>createCashMovementFromSale,
    "hasExistingCashMovement",
    ()=>hasExistingCashMovement
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/db.ts [app-route] (ecmascript)");
;
async function createCashMovementFromSale(companyId, orderId, amount, paymentMethod, userId) {
    // Trouver la session de caisse ouverte
    const openSessions = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sql"]`
    SELECT id FROM cash_sessions
    WHERE company_id = ${companyId} AND status = 'open'
    LIMIT 1
  `;
    if (openSessions.length === 0) {
        console.warn('Aucune session de caisse ouverte pour la vente:', orderId);
        return null;
    }
    const sessionId = openSessions[0].id;
    // Uniquement pour les paiements en espèces
    if (paymentMethod === 'cash') {
        await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sql"]`
      INSERT INTO cash_movements (
        company_id, cash_session_id, movement_type, category, 
        amount, description, reference_type, reference_id, created_by
      )
      VALUES (
        ${companyId}, ${sessionId}, 'cash_in', 'sale', 
        ${amount}, 'Vente automatique', 'sales_order', ${orderId}, ${userId}
      )
    `;
    }
}
async function createCashMovementFromCreditPayment(companyId, creditId, amount, paymentMethod, userId) {
    const openSessions = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sql"]`
    SELECT id FROM cash_sessions
    WHERE company_id = ${companyId} AND status = 'open'
    LIMIT 1
  `;
    if (openSessions.length === 0) {
        console.warn('Aucune session de caisse ouverte pour le paiement crédit:', creditId);
        return null;
    }
    const sessionId = openSessions[0].id;
    // Uniquement pour les paiements en espèces
    if (paymentMethod === 'cash') {
        await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sql"]`
      INSERT INTO cash_movements (
        company_id, cash_session_id, movement_type, category, 
        amount, description, reference_type, reference_id, created_by
      )
      VALUES (
        ${companyId}, ${sessionId}, 'cash_in', 'credit_payment', 
        ${amount}, 'Encaissement crédit', 'credit_note', ${creditId}, ${userId}
      )
    `;
    }
}
async function createCashMovementFromExpense(companyId, expenseId, amount, category, description, userId) {
    const openSessions = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sql"]`
    SELECT id FROM cash_sessions
    WHERE company_id = ${companyId} AND status = 'open'
    LIMIT 1
  `;
    if (openSessions.length === 0) {
        console.warn('Aucune session de caisse ouverte pour la dépense:', expenseId);
        return null;
    }
    const sessionId = openSessions[0].id;
    await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sql"]`
    INSERT INTO cash_movements (
      company_id, cash_session_id, movement_type, category, 
      amount, description, reference_type, reference_id, created_by
    )
    VALUES (
      ${companyId}, ${sessionId}, 'cash_out', 'expense', 
      ${amount}, ${description || 'Dépense automatique'}, 'expense', ${expenseId}, ${userId}
    )
  `;
}
async function hasExistingCashMovement(companyId, referenceType, referenceId) {
    const existing = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sql"]`
    SELECT id FROM cash_movements
    WHERE company_id = ${companyId} 
      AND reference_type = ${referenceType} 
      AND reference_id = ${referenceId}
    LIMIT 1
  `;
    return existing.length > 0;
}
}),
"[project]/app/api/sales/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GET",
    ()=>GET,
    "POST",
    ()=>POST
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$1$2e$6_react$2d$dom$40$19$2e$2$2e$4_react$40$19$2e$2$2e$4_$5f$react$40$19$2e$2$2e$4$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/next@16.1.6_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$3$2e$25$2e$76$2f$node_modules$2f$zod$2f$v3$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/external.js [app-route] (ecmascript) <export * as z>");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/auth.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/db.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$cash$2d$automation$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/cash-automation.ts [app-route] (ecmascript)");
;
;
;
;
;
const salesOrderSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$3$2e$25$2e$76$2f$node_modules$2f$zod$2f$v3$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    clientId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$3$2e$25$2e$76$2f$node_modules$2f$zod$2f$v3$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().uuid(),
    depotId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$3$2e$25$2e$76$2f$node_modules$2f$zod$2f$v3$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().uuid(),
    orderSource: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$3$2e$25$2e$76$2f$node_modules$2f$zod$2f$v3$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().optional(),
    paymentMethod: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$3$2e$25$2e$76$2f$node_modules$2f$zod$2f$v3$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum([
        'cash',
        'mobile_money',
        'credit',
        'mixed'
    ]),
    paidAmount: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$3$2e$25$2e$76$2f$node_modules$2f$zod$2f$v3$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().min(0).default(0),
    notes: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$3$2e$25$2e$76$2f$node_modules$2f$zod$2f$v3$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().optional(),
    items: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$3$2e$25$2e$76$2f$node_modules$2f$zod$2f$v3$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$3$2e$25$2e$76$2f$node_modules$2f$zod$2f$v3$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
        productVariantId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$3$2e$25$2e$76$2f$node_modules$2f$zod$2f$v3$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().uuid(),
        quantity: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$3$2e$25$2e$76$2f$node_modules$2f$zod$2f$v3$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().int().positive(),
        unitPrice: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$3$2e$25$2e$76$2f$node_modules$2f$zod$2f$v3$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().min(0),
        lotNumber: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$3$2e$25$2e$76$2f$node_modules$2f$zod$2f$v3$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().optional()
    })).min(1),
    packagingItems: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$3$2e$25$2e$76$2f$node_modules$2f$zod$2f$v3$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$3$2e$25$2e$76$2f$node_modules$2f$zod$2f$v3$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
        packagingTypeId: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$3$2e$25$2e$76$2f$node_modules$2f$zod$2f$v3$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().uuid(),
        quantityOut: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$3$2e$25$2e$76$2f$node_modules$2f$zod$2f$v3$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().int().min(0).default(0),
        quantityIn: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$3$2e$25$2e$76$2f$node_modules$2f$zod$2f$v3$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().int().min(0).default(0),
        unitPrice: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$3$2e$25$2e$76$2f$node_modules$2f$zod$2f$v3$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().min(0).default(0)
    })).optional()
});
function generateOrderNumber() {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `VNT-${dateStr}-${rand}`;
}
function formatCurrency(amount) {
    return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'XOF',
        minimumFractionDigits: 0
    }).format(amount);
}
async function POST(request) {
    try {
        const session = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["auth"])();
        if (!session?.user?.companyId) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$1$2e$6_react$2d$dom$40$19$2e$2$2e$4_react$40$19$2e$2$2e$4_$5f$react$40$19$2e$2$2e$4$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: 'Non autorisé'
            }, {
                status: 401
            });
        }
        const body = await request.json();
        const data = salesOrderSchema.parse(body);
        const { companyId } = session.user;
        // 1. Verify client belongs to company
        const clients = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sql"]`
      SELECT id, name, credit_limit, packaging_credit_limit FROM clients
      WHERE id = ${data.clientId} AND company_id = ${companyId} AND is_active = true
    `;
        if (clients.length === 0) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$1$2e$6_react$2d$dom$40$19$2e$2$2e$4_react$40$19$2e$2$2e$4_$5f$react$40$19$2e$2$2e$4$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: 'Client introuvable'
            }, {
                status: 404
            });
        }
        // 2. If credit payment, check product credit limit
        if (data.paymentMethod === 'credit') {
            const productAccounts = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sql"]`
        SELECT COALESCE(SUM(balance), 0) as current_debt
        FROM client_accounts
        WHERE client_id = ${data.clientId} AND account_type = 'product'
      `;
            const currentProductDebt = Math.abs(Number(productAccounts[0]?.current_debt || 0));
            const productCreditLimit = Number(clients[0].credit_limit);
            const subtotal = data.items.reduce((sum, item)=>sum + item.quantity * item.unitPrice, 0);
            const newProductDebt = subtotal - data.paidAmount;
            if (productCreditLimit > 0 && currentProductDebt + newProductDebt > productCreditLimit) {
                return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$1$2e$6_react$2d$dom$40$19$2e$2$2e$4_react$40$19$2e$2$2e$4_$5f$react$40$19$2e$2$2e$4$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                    error: `Plafond de crédit produits dépassé. Crédit actuel: ${formatCurrency(currentProductDebt)}, Limite: ${formatCurrency(productCreditLimit)}`
                }, {
                    status: 400
                });
            }
            // Check packaging credit limit
            const packagingCreditLimit = Number(clients[0].packaging_credit_limit);
            if (packagingCreditLimit > 0 && data.packagingItems && data.packagingItems.length > 0) {
                const packagingAccounts = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sql"]`
          SELECT COALESCE(SUM(balance), 0) as current_debt
          FROM client_accounts
          WHERE client_id = ${data.clientId} AND account_type = 'packaging'
        `;
                const currentPackagingDebt = Math.abs(Number(packagingAccounts[0]?.current_debt || 0));
                const newPackagingDebt = data.packagingItems.reduce((sum, item)=>sum + (item.quantityOut - item.quantityIn) * item.unitPrice, 0);
                if (currentPackagingDebt + newPackagingDebt > packagingCreditLimit) {
                    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$1$2e$6_react$2d$dom$40$19$2e$2$2e$4_react$40$19$2e$2$2e$4_$5f$react$40$19$2e$2$2e$4$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                        error: `Plafond de crédit emballages dépassé. Crédit actuel: ${formatCurrency(currentPackagingDebt)}, Limite: ${formatCurrency(packagingCreditLimit)}`
                    }, {
                        status: 400
                    });
                }
            }
        }
        // 3. Calculate totals
        const subtotal = data.items.reduce((sum, item)=>sum + item.quantity * item.unitPrice, 0);
        const packagingTotal = (data.packagingItems || []).reduce((sum, item)=>sum + (item.quantityOut - item.quantityIn) * item.unitPrice, 0);
        const totalAmount = subtotal + packagingTotal;
        // 4. Generate order number
        const orderNumber = generateOrderNumber();
        // 5. Allocate payment: products first, then packaging
        const paidForProducts = Math.min(subtotal, data.paidAmount);
        const paidForPackaging = Math.min(packagingTotal, Math.max(0, data.paidAmount - subtotal));
        // 6. Create sales order
        const orders = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sql"]`
      INSERT INTO sales_orders (
        company_id, client_id, depot_id, order_number, status,
        order_source, subtotal, packaging_total, total_amount,
        paid_amount, paid_amount_products, paid_amount_packaging,
        payment_method, notes, created_by
      ) VALUES (
        ${companyId}, ${data.clientId}, ${data.depotId}, ${orderNumber},
        'confirmed', ${data.orderSource || 'in_person'}, ${subtotal},
        ${packagingTotal}, ${totalAmount}, ${data.paidAmount},
        ${paidForProducts}, ${paidForPackaging},
        ${data.paymentMethod}, ${data.notes || null}, ${session.user.id}
      )
      RETURNING *
    `;
        const order = orders[0];
        // 7. Create order items + deduct stock
        for (const item of data.items){
            // Insert order item
            await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sql"]`
        INSERT INTO sales_order_items (
          sales_order_id, product_variant_id, quantity,
          unit_price, total_price, lot_number
        ) VALUES (
          ${order.id}, ${item.productVariantId}, ${item.quantity},
          ${item.unitPrice}, ${item.quantity * item.unitPrice},
          ${item.lotNumber || null}
        )
      `;
            // Deduct stock
            await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sql"]`
        UPDATE stock
        SET quantity = quantity - ${item.quantity}, updated_at = NOW()
        WHERE depot_id = ${data.depotId}
          AND product_variant_id = ${item.productVariantId}
          AND quantity >= ${item.quantity}
      `;
            // Record stock movement
            await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sql"]`
        INSERT INTO stock_movements (
          company_id, depot_id, product_variant_id,
          movement_type, quantity, reference_type, reference_id,
          lot_number, created_by
        ) VALUES (
          ${companyId}, ${data.depotId}, ${item.productVariantId},
          'sale', ${-item.quantity}, 'sales_order', ${order.id},
          ${item.lotNumber || null}, ${session.user.id}
        )
      `;
        }
        // 8. Handle packaging items
        if (data.packagingItems && data.packagingItems.length > 0) {
            for (const pkg of data.packagingItems){
                // Insert into sales_order_packaging_items
                await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sql"]`
          INSERT INTO sales_order_packaging_items (
            sales_order_id, packaging_type_id,
            quantity_out, quantity_in, unit_price
          ) VALUES (
            ${order.id}, ${pkg.packagingTypeId},
            ${pkg.quantityOut}, ${pkg.quantityIn}, ${pkg.unitPrice}
          )
        `;
                // Log packaging transaction
                const netOut = pkg.quantityOut - pkg.quantityIn;
                if (netOut !== 0) {
                    await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sql"]`
            INSERT INTO packaging_transactions (
              company_id, client_id, sales_order_id,
              packaging_type_id, transaction_type, quantity,
              unit_price, total_amount, created_by
            ) VALUES (
              ${companyId}, ${data.clientId}, ${order.id},
              ${pkg.packagingTypeId},
              ${netOut > 0 ? 'given' : 'returned'},
              ${Math.abs(netOut)},
              ${pkg.unitPrice},
              ${Math.abs(netOut) * pkg.unitPrice},
              ${session.user.id}
            )
          `;
                }
                // Update packaging stock
                if (pkg.quantityOut > 0) {
                    await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sql"]`
            UPDATE packaging_stock
            SET quantity = quantity - ${pkg.quantityOut}, updated_at = NOW()
            WHERE depot_id = ${data.depotId}
              AND packaging_type_id = ${pkg.packagingTypeId}
          `;
                }
                if (pkg.quantityIn > 0) {
                    await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sql"]`
            UPDATE packaging_stock
            SET quantity = quantity + ${pkg.quantityIn}, updated_at = NOW()
            WHERE depot_id = ${data.depotId}
              AND packaging_type_id = ${pkg.packagingTypeId}
          `;
                }
            }
        }
        // 9. Update client accounts (debt = amount owed minus what was paid)
        const productDebtChange = subtotal - paidForProducts;
        const packagingDebtChange = packagingTotal - paidForPackaging;
        // Update product account (negative balance = client owes money)
        if (productDebtChange !== 0) {
            await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sql"]`
        UPDATE client_accounts
        SET balance = balance - ${productDebtChange},
            last_transaction_at = NOW(),
            updated_at = NOW()
        WHERE client_id = ${data.clientId} AND account_type = 'product'
      `;
        }
        // Update packaging account
        if (packagingDebtChange !== 0) {
            await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sql"]`
        UPDATE client_accounts
        SET balance = balance - ${packagingDebtChange},
            last_transaction_at = NOW(),
            updated_at = NOW()
        WHERE client_id = ${data.clientId} AND account_type = 'packaging'
      `;
        }
        // 10. Record payment(s) — separate records for product and packaging portions
        if (paidForProducts > 0) {
            await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sql"]`
        INSERT INTO payments (
          company_id, client_id, sales_order_id,
          amount, payment_method, payment_type, status, received_by
        ) VALUES (
          ${companyId}, ${data.clientId}, ${order.id},
          ${paidForProducts}, ${data.paymentMethod}, 'product',
          'completed', ${session.user.id}
        )
      `;
        }
        if (paidForPackaging > 0) {
            await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sql"]`
        INSERT INTO payments (
          company_id, client_id, sales_order_id,
          amount, payment_method, payment_type, status, received_by
        ) VALUES (
          ${companyId}, ${data.clientId}, ${order.id},
          ${paidForPackaging}, ${data.paymentMethod}, 'packaging',
          'completed', ${session.user.id}
        )
      `;
        }
        // 11. Auto-generate invoice for this sale
        try {
            const invPrefix = 'FC';
            const invDate = new Date();
            const invY = invDate.getFullYear().toString().slice(-2);
            const invM = (invDate.getMonth() + 1).toString().padStart(2, '0');
            const invRand = Math.random().toString(36).substring(2, 6).toUpperCase();
            const invoiceNumber = `${invPrefix}-${invY}${invM}-${invRand}`;
            const invPaid = Number(data.paidAmount);
            const invRemaining = totalAmount - invPaid;
            const invStatus = invPaid >= totalAmount ? 'paid' : invPaid > 0 ? 'partial' : 'draft';
            const invResult = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sql"]`
        INSERT INTO invoices (
          invoice_number, type, company_id, client_id,
          order_id, total_ht, total_ttc, total_amount,
          amount_paid, remaining_amount, status
        ) VALUES (
          ${invoiceNumber}, 'client', ${companyId}, ${data.clientId},
          ${order.id}, ${totalAmount}, ${totalAmount}, ${totalAmount},
          ${invPaid}, ${invRemaining}, ${invStatus}
        )
        RETURNING id
      `;
            if (invResult[0]?.id) {
                for (const item of data.items){
                    const lineTotal = item.quantity * item.unitPrice;
                    await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sql"]`
            INSERT INTO invoice_items (
              invoice_id, product_id, description,
              quantity, unit_price, total_price, item_type
            ) VALUES (
              ${invResult[0].id}, ${item.productVariantId}, ${'Produit'},
              ${item.quantity}, ${item.unitPrice}, ${lineTotal}, 'product'
            )
          `;
                }
            }
        } catch (invError) {
            console.error('Error auto-generating invoice (non-blocking):', invError);
        }
        // 12. Créer automatiquement le mouvement de caisse pour les paiements en espèces
        if (data.paidAmount > 0 && (data.paymentMethod === 'cash' || data.paymentMethod === 'mixed')) {
            try {
                // Vérifier si le mouvement existe déjà
                const existingMovement = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$cash$2d$automation$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["hasExistingCashMovement"])(companyId, 'sales_order', order.id);
                if (!existingMovement) {
                    await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$cash$2d$automation$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["createCashMovementFromSale"])(companyId, order.id, data.paidAmount, 'cash', session.user.id);
                }
            } catch (cashError) {
                console.error('Error creating cash movement (non-blocking):', cashError);
            }
        }
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$1$2e$6_react$2d$dom$40$19$2e$2$2e$4_react$40$19$2e$2$2e$4_$5f$react$40$19$2e$2$2e$4$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            success: true,
            data: order,
            message: 'Vente créée avec succès'
        }, {
            status: 201
        });
    } catch (error) {
        if (error instanceof __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$zod$40$3$2e$25$2e$76$2f$node_modules$2f$zod$2f$v3$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].ZodError) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$1$2e$6_react$2d$dom$40$19$2e$2$2e$4_react$40$19$2e$2$2e$4_$5f$react$40$19$2e$2$2e$4$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: 'Données invalides',
                details: error.errors
            }, {
                status: 400
            });
        }
        console.error('Error creating sale:', error);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$1$2e$6_react$2d$dom$40$19$2e$2$2e$4_react$40$19$2e$2$2e$4_$5f$react$40$19$2e$2$2e$4$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'Erreur lors de la création de la vente'
        }, {
            status: 500
        });
    }
}
async function GET(request) {
    try {
        const session = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$auth$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["auth"])();
        if (!session?.user?.companyId) {
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$1$2e$6_react$2d$dom$40$19$2e$2$2e$4_react$40$19$2e$2$2e$4_$5f$react$40$19$2e$2$2e$4$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                error: 'Non autorisé'
            }, {
                status: 401
            });
        }
        const { searchParams } = new URL(request.url);
        const status = searchParams.get('status');
        const clientId = searchParams.get('clientId');
        const limit = parseInt(searchParams.get('limit') || '100');
        const offset = parseInt(searchParams.get('offset') || '0');
        let orders;
        if (status && clientId) {
            orders = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sql"]`
        SELECT so.*, c.name as client_name
        FROM sales_orders so
        LEFT JOIN clients c ON so.client_id = c.id
        WHERE so.company_id = ${session.user.companyId}
          AND so.status = ${status}
          AND so.client_id = ${clientId}
        ORDER BY so.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
        } else if (status) {
            orders = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sql"]`
        SELECT so.*, c.name as client_name
        FROM sales_orders so
        LEFT JOIN clients c ON so.client_id = c.id
        WHERE so.company_id = ${session.user.companyId}
          AND so.status = ${status}
        ORDER BY so.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
        } else if (clientId) {
            orders = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sql"]`
        SELECT so.*, c.name as client_name
        FROM sales_orders so
        LEFT JOIN clients c ON so.client_id = c.id
        WHERE so.company_id = ${session.user.companyId}
          AND so.client_id = ${clientId}
        ORDER BY so.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
        } else {
            orders = await __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$db$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["sql"]`
        SELECT so.*, c.name as client_name
        FROM sales_orders so
        LEFT JOIN clients c ON so.client_id = c.id
        WHERE so.company_id = ${session.user.companyId}
        ORDER BY so.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
        }
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$1$2e$6_react$2d$dom$40$19$2e$2$2e$4_react$40$19$2e$2$2e$4_$5f$react$40$19$2e$2$2e$4$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            success: true,
            data: orders
        });
    } catch (error) {
        console.error('Error fetching sales:', error);
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$1$2e$6_react$2d$dom$40$19$2e$2$2e$4_react$40$19$2e$2$2e$4_$5f$react$40$19$2e$2$2e$4$2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'Erreur lors de la récupération des ventes'
        }, {
            status: 500
        });
    }
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__ee02dc5c._.js.map