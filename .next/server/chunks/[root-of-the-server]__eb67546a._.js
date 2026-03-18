module.exports=[18622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},56704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},32319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},20635,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/action-async-storage.external.js",()=>require("next/dist/server/app-render/action-async-storage.external.js"))},24725,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/after-task-async-storage.external.js",()=>require("next/dist/server/app-render/after-task-async-storage.external.js"))},70406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},93695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},54799,(e,t,r)=>{t.exports=e.x("crypto",()=>require("crypto"))},24664,e=>{"use strict";var t=e.i(36674),r=e.i(41118),a=e.i(59617),n=e.i(52171),i=e.i(43408),s=e.i(67620),o=e.i(82397),d=e.i(27688),u=e.i(75897),p=e.i(96582),l=e.i(47308),c=e.i(18505),m=e.i(84130),_=e.i(26866),E=e.i(77048),R=e.i(93695);e.i(3348);var x=e.i(76390),y=e.i(52716),h=e.i(469),v=e.i(68105),g=e.i(62294);let N=h.z.object({supplierId:h.z.string().uuid(),depotId:h.z.string().uuid(),expectedDeliveryAt:h.z.string().optional(),notes:h.z.string().optional(),items:h.z.array(h.z.object({productVariantId:h.z.string().uuid(),quantityOrdered:h.z.number().int().positive(),unitPrice:h.z.number().min(0),lotNumber:h.z.string().optional(),expiryDate:h.z.string().optional()})).min(1)}),f=h.z.object({purchaseOrderId:h.z.string().uuid(),items:h.z.array(h.z.object({itemId:h.z.string().uuid(),quantityReceived:h.z.number().int().min(0),quantityDamaged:h.z.number().int().min(0).default(0),lotNumber:h.z.string().optional(),expiryDate:h.z.string().optional()}))});async function $(e){try{let t=await (0,v.auth)();if(!t?.user?.companyId)return y.NextResponse.json({error:"Non autorisé"},{status:401});let r=await e.json(),{companyId:a}=t.user;if(r.purchaseOrderId){let e=f.parse(r),n=await g.sql`
        SELECT * FROM purchase_orders
        WHERE id = ${e.purchaseOrderId} AND company_id = ${a}
      `;if(0===n.length)return y.NextResponse.json({error:"Commande introuvable"},{status:404});let i=n[0];for(let r of e.items){await g.sql`
          UPDATE purchase_order_items
          SET quantity_received = ${r.quantityReceived},
              quantity_damaged = ${r.quantityDamaged},
              lot_number = COALESCE(${r.lotNumber||null}, lot_number),
              expiry_date = COALESCE(${r.expiryDate||null}, expiry_date),
              updated_at = NOW()
          WHERE id = ${r.itemId}
            AND purchase_order_id = ${e.purchaseOrderId}
        `;let n=await g.sql`
          SELECT product_variant_id FROM purchase_order_items WHERE id = ${r.itemId}
        `,s=n[0]?.product_variant_id;if(s&&r.quantityReceived>0){let n=await g.sql`
            SELECT id FROM stock
            WHERE depot_id = ${i.depot_id}
              AND product_variant_id = ${s}
              AND lot_number = ${r.lotNumber||null}
          `;n.length>0?await g.sql`
              UPDATE stock
              SET quantity = quantity + ${r.quantityReceived},
                  expiry_date = COALESCE(${r.expiryDate||null}, expiry_date),
                  updated_at = NOW()
              WHERE id = ${n[0].id}
            `:await g.sql`
              INSERT INTO stock (depot_id, product_variant_id, lot_number, quantity, expiry_date)
              VALUES (${i.depot_id}, ${s}, ${r.lotNumber||null},
                      ${r.quantityReceived}, ${r.expiryDate||null})
            `,await g.sql`
            INSERT INTO stock_movements (
              company_id, depot_id, product_variant_id,
              movement_type, quantity, reference_type, reference_id,
              lot_number, created_by
            ) VALUES (
              ${a}, ${i.depot_id}, ${s},
              'purchase', ${r.quantityReceived}, 'purchase_order',
              ${e.purchaseOrderId}, ${r.lotNumber||null},
              ${t.user.id}
            )
          `,r.quantityDamaged>0&&await g.sql`
              INSERT INTO stock_movements (
                company_id, depot_id, product_variant_id,
                movement_type, quantity, reference_type, reference_id,
                notes, created_by
              ) VALUES (
                ${a}, ${i.depot_id}, ${s},
                'damage', ${-r.quantityDamaged}, 'purchase_order',
                ${e.purchaseOrderId}, 'Casse à la réception',
                ${t.user.id}
              )
            `}}return await g.sql`
        UPDATE purchase_orders
        SET status = 'received', received_at = NOW(), updated_at = NOW()
        WHERE id = ${e.purchaseOrderId}
      `,y.NextResponse.json({success:!0,message:"Réception enregistrée avec succès"})}{let e,n,i=N.parse(r),s=(e=new Date().toISOString().slice(0,10).replace(/-/g,""),n=Math.random().toString(36).substring(2,8).toUpperCase(),`ACH-${e}-${n}`),o=i.items.reduce((e,t)=>e+t.quantityOrdered*t.unitPrice,0),d=await g.sql`
        INSERT INTO purchase_orders (
          company_id, supplier_id, depot_id, order_number,
          status, total_amount, notes, expected_delivery_at, created_by
        ) VALUES (
          ${a}, ${i.supplierId}, ${i.depotId},
          ${s}, 'pending', ${o},
          ${i.notes||null}, ${i.expectedDeliveryAt||null},
          ${t.user.id}
        )
        RETURNING *
      `;for(let e of i.items)await g.sql`
          INSERT INTO purchase_order_items (
            purchase_order_id, product_variant_id, quantity_ordered,
            unit_price, lot_number, expiry_date
          ) VALUES (
            ${d[0].id}, ${e.productVariantId}, ${e.quantityOrdered},
            ${e.unitPrice}, ${e.lotNumber||null}, ${e.expiryDate||null}
          )
        `;return y.NextResponse.json({success:!0,data:d[0],message:"Commande d'achat créée avec succès"},{status:201})}}catch(e){if(e instanceof h.z.ZodError)return y.NextResponse.json({error:"Données invalides",details:e.errors},{status:400});return console.error("Error in procurement:",e),y.NextResponse.json({error:"Erreur lors du traitement de la commande"},{status:500})}}async function O(e){try{let t,r=await (0,v.auth)();if(!r?.user?.companyId)return y.NextResponse.json({error:"Non autorisé"},{status:401});let{searchParams:a}=new URL(e.url),n=a.get("status");return t=n?await g.sql`
        SELECT po.*, s.name as supplier_name, d.name as depot_name
        FROM purchase_orders po
        LEFT JOIN suppliers s ON po.supplier_id = s.id
        LEFT JOIN depots d ON po.depot_id = d.id
        WHERE po.company_id = ${r.user.companyId}
          AND po.status = ${n}
        ORDER BY po.created_at DESC
      `:await g.sql`
        SELECT po.*, s.name as supplier_name, d.name as depot_name
        FROM purchase_orders po
        LEFT JOIN suppliers s ON po.supplier_id = s.id
        LEFT JOIN depots d ON po.depot_id = d.id
        WHERE po.company_id = ${r.user.companyId}
        ORDER BY po.created_at DESC
      `,y.NextResponse.json({success:!0,data:t})}catch(e){return console.error("Error fetching procurement:",e),y.NextResponse.json({error:"Erreur lors de la récupération des commandes"},{status:500})}}e.s(["GET",()=>O,"POST",()=>$],63982);var w=e.i(63982);let q=new t.AppRouteRouteModule({definition:{kind:r.RouteKind.APP_ROUTE,page:"/api/procurement/route",pathname:"/api/procurement",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/app/api/procurement/route.ts",nextConfigOutput:"",userland:w}),{workAsyncStorage:b,workUnitAsyncStorage:C,serverHooks:T}=q;function I(){return(0,a.patchFetch)({workAsyncStorage:b,workUnitAsyncStorage:C})}async function A(e,t,a){q.isDev&&(0,n.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let y="/api/procurement/route";y=y.replace(/\/index$/,"")||"/";let h=await q.prepare(e,t,{srcPage:y,multiZoneDraftMode:!1});if(!h)return t.statusCode=400,t.end("Bad Request"),null==a.waitUntil||a.waitUntil.call(a,Promise.resolve()),null;let{buildId:v,params:g,nextConfig:N,parsedUrl:f,isDraftMode:$,prerenderManifest:O,routerServerContext:w,isOnDemandRevalidate:b,revalidateOnlyGenerated:C,resolvedPathname:T,clientReferenceManifest:I,serverActionsManifest:A}=h,S=(0,o.normalizeAppPath)(y),D=!!(O.dynamicRoutes[S]||O.routes[T]),j=async()=>((null==w?void 0:w.render404)?await w.render404(e,t,f,!1):t.end("This page could not be found"),null);if(D&&!$){let e=!!O.routes[T],t=O.dynamicRoutes[S];if(t&&!1===t.fallback&&!e){if(N.experimental.adapterPath)return await j();throw new R.NoFallbackError}}let P=null;!D||q.isDev||$||(P="/index"===(P=T)?"/":P);let U=!0===q.isDev||!D,k=D&&!U;A&&I&&(0,s.setManifestsSingleton)({page:y,clientReferenceManifest:I,serverActionsManifest:A});let H=e.method||"GET",z=(0,i.getTracer)(),L=z.getActiveScopeSpan(),M={params:g,prerenderManifest:O,renderOpts:{experimental:{authInterrupts:!!N.experimental.authInterrupts},cacheComponents:!!N.cacheComponents,supportsDynamicResponse:U,incrementalCache:(0,n.getRequestMeta)(e,"incrementalCache"),cacheLifeProfiles:N.cacheLife,waitUntil:a.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,r,a,n)=>q.onRequestError(e,t,a,n,w)},sharedContext:{buildId:v}},F=new d.NodeNextRequest(e),W=new d.NodeNextResponse(t),V=u.NextRequestAdapter.fromNodeNextRequest(F,(0,u.signalFromNodeResponse)(t));try{let s=async e=>q.handle(V,M).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let r=z.getRootSpanAttributes();if(!r)return;if(r.get("next.span_type")!==p.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${r.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let a=r.get("next.route");if(a){let t=`${H} ${a}`;e.setAttributes({"next.route":a,"http.route":a,"next.span_name":t}),e.updateName(t)}else e.updateName(`${H} ${y}`)}),o=!!(0,n.getRequestMeta)(e,"minimalMode"),d=async n=>{var i,d;let u=async({previousCacheEntry:r})=>{try{if(!o&&b&&C&&!r)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let i=await s(n);e.fetchMetrics=M.renderOpts.fetchMetrics;let d=M.renderOpts.pendingWaitUntil;d&&a.waitUntil&&(a.waitUntil(d),d=void 0);let u=M.renderOpts.collectedTags;if(!D)return await (0,c.sendResponse)(F,W,i,M.renderOpts.pendingWaitUntil),null;{let e=await i.blob(),t=(0,m.toNodeOutgoingHttpHeaders)(i.headers);u&&(t[E.NEXT_CACHE_TAGS_HEADER]=u),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let r=void 0!==M.renderOpts.collectedRevalidate&&!(M.renderOpts.collectedRevalidate>=E.INFINITE_CACHE)&&M.renderOpts.collectedRevalidate,a=void 0===M.renderOpts.collectedExpire||M.renderOpts.collectedExpire>=E.INFINITE_CACHE?void 0:M.renderOpts.collectedExpire;return{value:{kind:x.CachedRouteKind.APP_ROUTE,status:i.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:r,expire:a}}}}catch(t){throw(null==r?void 0:r.isStale)&&await q.onRequestError(e,t,{routerKind:"App Router",routePath:y,routeType:"route",revalidateReason:(0,l.getRevalidateReason)({isStaticGeneration:k,isOnDemandRevalidate:b})},!1,w),t}},p=await q.handleResponse({req:e,nextConfig:N,cacheKey:P,routeKind:r.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:O,isRoutePPREnabled:!1,isOnDemandRevalidate:b,revalidateOnlyGenerated:C,responseGenerator:u,waitUntil:a.waitUntil,isMinimalMode:o});if(!D)return null;if((null==p||null==(i=p.value)?void 0:i.kind)!==x.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==p||null==(d=p.value)?void 0:d.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});o||t.setHeader("x-nextjs-cache",b?"REVALIDATED":p.isMiss?"MISS":p.isStale?"STALE":"HIT"),$&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let R=(0,m.fromNodeOutgoingHttpHeaders)(p.value.headers);return o&&D||R.delete(E.NEXT_CACHE_TAGS_HEADER),!p.cacheControl||t.getHeader("Cache-Control")||R.get("Cache-Control")||R.set("Cache-Control",(0,_.getCacheControlHeader)(p.cacheControl)),await (0,c.sendResponse)(F,W,new Response(p.value.body,{headers:R,status:p.value.status||200})),null};L?await d(L):await z.withPropagatedContext(e.headers,()=>z.trace(p.BaseServerSpan.handleRequest,{spanName:`${H} ${y}`,kind:i.SpanKind.SERVER,attributes:{"http.method":H,"http.target":e.url}},d))}catch(t){if(t instanceof R.NoFallbackError||await q.onRequestError(e,t,{routerKind:"App Router",routePath:S,routeType:"route",revalidateReason:(0,l.getRevalidateReason)({isStaticGeneration:k,isOnDemandRevalidate:b})},!1,w),D)throw t;return await (0,c.sendResponse)(F,W,new Response(null,{status:500})),null}}e.s(["handler",()=>A,"patchFetch",()=>I,"routeModule",()=>q,"serverHooks",()=>T,"workAsyncStorage",()=>b,"workUnitAsyncStorage",()=>C],24664)}];

//# sourceMappingURL=%5Broot-of-the-server%5D__eb67546a._.js.map