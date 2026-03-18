module.exports=[18622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},56704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},32319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},20635,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/action-async-storage.external.js",()=>require("next/dist/server/app-render/action-async-storage.external.js"))},24725,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/after-task-async-storage.external.js",()=>require("next/dist/server/app-render/after-task-async-storage.external.js"))},70406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},93695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},54799,(e,t,r)=>{t.exports=e.x("crypto",()=>require("crypto"))},29771,e=>{"use strict";var t=e.i(36674),r=e.i(41118),a=e.i(59617),n=e.i(52171),i=e.i(43408),s=e.i(67620),o=e.i(82397),p=e.i(27688),d=e.i(75897),l=e.i(96582),c=e.i(47308),u=e.i(18505),g=e.i(84130),R=e.i(26866),E=e.i(77048),v=e.i(93695);e.i(3348);var _=e.i(76390),m=e.i(52716),x=e.i(469),h=e.i(68105),y=e.i(62294);let f=x.z.object({name:x.z.string().min(1,"Nom du produit requis"),sku:x.z.string().optional(),category:x.z.string().optional(),brand:x.z.string().optional(),description:x.z.string().optional(),baseUnit:x.z.string().default("casier"),purchasePrice:x.z.number().min(0).default(0),sellingPrice:x.z.number().min(0).default(0),imageUrl:x.z.string().optional(),variants:x.z.array(x.z.object({packagingTypeId:x.z.string().uuid(),barcode:x.z.string().optional(),price:x.z.number().min(0),costPrice:x.z.number().min(0).optional()})).optional()});async function N(e){try{let t=await (0,h.auth)();if(!t?.user?.companyId)return m.NextResponse.json({error:"Non autorisé"},{status:401});let r=await e.json(),a=f.parse(r),{companyId:n}=t.user;if(a.sku&&(await y.sql`
        SELECT id FROM products
        WHERE company_id = ${n} AND sku = ${a.sku} AND is_active = true
      `).length>0)return m.NextResponse.json({error:"Un produit avec ce SKU existe déjà"},{status:409});let i=await y.sql`
      INSERT INTO products (
        company_id, name, sku, category, brand, description,
        base_unit, purchase_price, selling_price, image_url
      ) VALUES (
        ${n}, ${a.name}, ${a.sku||null},
        ${a.category||null}, ${a.brand||null},
        ${a.description||null}, ${a.baseUnit},
        ${a.purchasePrice}, ${a.sellingPrice},
        ${a.imageUrl||null}
      )
      RETURNING *
    `;i[0].id;let s=`Emballage - ${a.name} ${"bouteille"===a.baseUnit?"":a.baseUnit}`.trim(),o=(await y.sql`
      INSERT INTO packaging_types (
        company_id, name, description, units_per_case, is_returnable, deposit_price
      ) VALUES (
        ${n}, ${s}, 'Emballage créé automatiquement pour ${a.name}', 1, true, 0
      )
      RETURNING id
    `)[0].id,p=await y.sql`SELECT id FROM depots WHERE company_id = ${n}`;if(p.length>0)for(let e of p)await y.sql`
          INSERT INTO packaging_stock (depot_id, packaging_type_id, quantity)
          VALUES (${e.id}, ${o}, 0)
        `;if(a.variants&&a.variants.length>0)for(let e of a.variants)await y.sql`
          INSERT INTO product_variants(
            product_id, packaging_type_id, barcode, price, cost_price
          ) VALUES(
            ${i[0].id}, ${e.packagingTypeId},
            ${e.barcode||null}, ${e.price},
            ${e.costPrice||null}
          )
        `;return m.NextResponse.json({success:!0,data:i[0],message:"Produit créé avec succès"},{status:201})}catch(e){if(e instanceof x.z.ZodError)return m.NextResponse.json({error:"Données invalides",details:e.errors},{status:400});return console.error("Error creating product:",e),m.NextResponse.json({error:"Erreur lors de la création du produit"},{status:500})}}async function b(e){try{let t=await (0,h.auth)();if(!t?.user?.companyId)return m.NextResponse.json({error:"Non autorisé"},{status:401});let{searchParams:r}=new URL(e.url),a=r.get("category"),n=r.get("search");r.get("withVariants");let i=a?await y.sql`
        SELECT p.*,
      COALESCE(
        json_agg(
          json_build_object(
            'id', pv.id,
            'packaging_type_id', pv.packaging_type_id,
            'barcode', pv.barcode,
            'price', pv.price,
            'cost_price', pv.cost_price,
            'packaging_name', pt.name,
            'units_per_case', pt.units_per_case
          )
        ) FILTER(WHERE pv.id IS NOT NULL), '[]'
      ) as variants
        FROM products p
        LEFT JOIN product_variants pv ON p.id = pv.product_id
        LEFT JOIN packaging_types pt ON pv.packaging_type_id = pt.id
        WHERE p.company_id = ${t.user.companyId}
          AND p.is_active = true
          AND p.category = ${a}
        GROUP BY p.id
        ORDER BY p.name
      `:await y.sql`
        SELECT p.*,
      COALESCE(
        json_agg(
          json_build_object(
            'id', pv.id,
            'packaging_type_id', pv.packaging_type_id,
            'barcode', pv.barcode,
            'price', pv.price,
            'cost_price', pv.cost_price,
            'packaging_name', pt.name,
            'units_per_case', pt.units_per_case
          )
        ) FILTER(WHERE pv.id IS NOT NULL), '[]'
      ) as variants
        FROM products p
        LEFT JOIN product_variants pv ON p.id = pv.product_id
        LEFT JOIN packaging_types pt ON pv.packaging_type_id = pt.id
        WHERE p.company_id = ${t.user.companyId}
          AND p.is_active = true
        GROUP BY p.id
        ORDER BY p.name
      `;if(n){let e=n.toLowerCase();i=i.filter(t=>String(t.name).toLowerCase().includes(e)||String(t.sku||"").toLowerCase().includes(e)||String(t.brand||"").toLowerCase().includes(e))}return m.NextResponse.json({success:!0,data:i})}catch(e){return console.error("Error fetching products:",e),m.NextResponse.json({error:"Erreur lors de la récupération des produits"},{status:500})}}e.s(["GET",()=>b,"POST",()=>N],55773);var w=e.i(55773);let T=new t.AppRouteRouteModule({definition:{kind:r.RouteKind.APP_ROUTE,page:"/api/products/route",pathname:"/api/products",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/app/api/products/route.ts",nextConfigOutput:"",userland:w}),{workAsyncStorage:C,workUnitAsyncStorage:O,serverHooks:k}=T;function A(){return(0,a.patchFetch)({workAsyncStorage:C,workUnitAsyncStorage:O})}async function S(e,t,a){T.isDev&&(0,n.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let m="/api/products/route";m=m.replace(/\/index$/,"")||"/";let x=await T.prepare(e,t,{srcPage:m,multiZoneDraftMode:!1});if(!x)return t.statusCode=400,t.end("Bad Request"),null==a.waitUntil||a.waitUntil.call(a,Promise.resolve()),null;let{buildId:h,params:y,nextConfig:f,parsedUrl:N,isDraftMode:b,prerenderManifest:w,routerServerContext:C,isOnDemandRevalidate:O,revalidateOnlyGenerated:k,resolvedPathname:A,clientReferenceManifest:S,serverActionsManifest:I}=x,j=(0,o.normalizeAppPath)(m),$=!!(w.dynamicRoutes[j]||w.routes[A]),U=async()=>((null==C?void 0:C.render404)?await C.render404(e,t,N,!1):t.end("This page could not be found"),null);if($&&!b){let e=!!w.routes[A],t=w.dynamicRoutes[j];if(t&&!1===t.fallback&&!e){if(f.experimental.adapterPath)return await U();throw new v.NoFallbackError}}let q=null;!$||T.isDev||b||(q="/index"===(q=A)?"/":q);let P=!0===T.isDev||!$,L=$&&!P;I&&S&&(0,s.setManifestsSingleton)({page:m,clientReferenceManifest:S,serverActionsManifest:I});let H=e.method||"GET",D=(0,i.getTracer)(),z=D.getActiveScopeSpan(),F={params:y,prerenderManifest:w,renderOpts:{experimental:{authInterrupts:!!f.experimental.authInterrupts},cacheComponents:!!f.cacheComponents,supportsDynamicResponse:P,incrementalCache:(0,n.getRequestMeta)(e,"incrementalCache"),cacheLifeProfiles:f.cacheLife,waitUntil:a.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,r,a,n)=>T.onRequestError(e,t,a,n,C)},sharedContext:{buildId:h}},M=new p.NodeNextRequest(e),B=new p.NodeNextResponse(t),K=d.NextRequestAdapter.fromNodeNextRequest(M,(0,d.signalFromNodeResponse)(t));try{let s=async e=>T.handle(K,F).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let r=D.getRootSpanAttributes();if(!r)return;if(r.get("next.span_type")!==l.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${r.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let a=r.get("next.route");if(a){let t=`${H} ${a}`;e.setAttributes({"next.route":a,"http.route":a,"next.span_name":t}),e.updateName(t)}else e.updateName(`${H} ${m}`)}),o=!!(0,n.getRequestMeta)(e,"minimalMode"),p=async n=>{var i,p;let d=async({previousCacheEntry:r})=>{try{if(!o&&O&&k&&!r)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let i=await s(n);e.fetchMetrics=F.renderOpts.fetchMetrics;let p=F.renderOpts.pendingWaitUntil;p&&a.waitUntil&&(a.waitUntil(p),p=void 0);let d=F.renderOpts.collectedTags;if(!$)return await (0,u.sendResponse)(M,B,i,F.renderOpts.pendingWaitUntil),null;{let e=await i.blob(),t=(0,g.toNodeOutgoingHttpHeaders)(i.headers);d&&(t[E.NEXT_CACHE_TAGS_HEADER]=d),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let r=void 0!==F.renderOpts.collectedRevalidate&&!(F.renderOpts.collectedRevalidate>=E.INFINITE_CACHE)&&F.renderOpts.collectedRevalidate,a=void 0===F.renderOpts.collectedExpire||F.renderOpts.collectedExpire>=E.INFINITE_CACHE?void 0:F.renderOpts.collectedExpire;return{value:{kind:_.CachedRouteKind.APP_ROUTE,status:i.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:r,expire:a}}}}catch(t){throw(null==r?void 0:r.isStale)&&await T.onRequestError(e,t,{routerKind:"App Router",routePath:m,routeType:"route",revalidateReason:(0,c.getRevalidateReason)({isStaticGeneration:L,isOnDemandRevalidate:O})},!1,C),t}},l=await T.handleResponse({req:e,nextConfig:f,cacheKey:q,routeKind:r.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:w,isRoutePPREnabled:!1,isOnDemandRevalidate:O,revalidateOnlyGenerated:k,responseGenerator:d,waitUntil:a.waitUntil,isMinimalMode:o});if(!$)return null;if((null==l||null==(i=l.value)?void 0:i.kind)!==_.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==l||null==(p=l.value)?void 0:p.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});o||t.setHeader("x-nextjs-cache",O?"REVALIDATED":l.isMiss?"MISS":l.isStale?"STALE":"HIT"),b&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let v=(0,g.fromNodeOutgoingHttpHeaders)(l.value.headers);return o&&$||v.delete(E.NEXT_CACHE_TAGS_HEADER),!l.cacheControl||t.getHeader("Cache-Control")||v.get("Cache-Control")||v.set("Cache-Control",(0,R.getCacheControlHeader)(l.cacheControl)),await (0,u.sendResponse)(M,B,new Response(l.value.body,{headers:v,status:l.value.status||200})),null};z?await p(z):await D.withPropagatedContext(e.headers,()=>D.trace(l.BaseServerSpan.handleRequest,{spanName:`${H} ${m}`,kind:i.SpanKind.SERVER,attributes:{"http.method":H,"http.target":e.url}},p))}catch(t){if(t instanceof v.NoFallbackError||await T.onRequestError(e,t,{routerKind:"App Router",routePath:j,routeType:"route",revalidateReason:(0,c.getRevalidateReason)({isStaticGeneration:L,isOnDemandRevalidate:O})},!1,C),$)throw t;return await (0,u.sendResponse)(M,B,new Response(null,{status:500})),null}}e.s(["handler",()=>S,"patchFetch",()=>A,"routeModule",()=>T,"serverHooks",()=>k,"workAsyncStorage",()=>C,"workUnitAsyncStorage",()=>O],29771)}];

//# sourceMappingURL=%5Broot-of-the-server%5D__13c819c4._.js.map