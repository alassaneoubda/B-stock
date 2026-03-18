module.exports=[13694,e=>{"use strict";var t=e.i(36674),a=e.i(41118),n=e.i(59617),i=e.i(52171),r=e.i(43408),s=e.i(67620),o=e.i(82397),d=e.i(27688),u=e.i(75897),c=e.i(96582),l=e.i(47308),p=e.i(18505),_=e.i(84130),m=e.i(26866),E=e.i(77048),y=e.i(93695);e.i(3348);var R=e.i(76390),g=e.i(52716),$=e.i(469),I=e.i(68105),N=e.i(62294);let h=$.z.object({clientId:$.z.string().uuid(),depotId:$.z.string().uuid(),orderSource:$.z.string().optional(),paymentMethod:$.z.enum(["cash","mobile_money","credit","mixed"]),paidAmount:$.z.number().min(0).default(0),notes:$.z.string().optional(),items:$.z.array($.z.object({productVariantId:$.z.string().uuid(),quantity:$.z.number().int().positive(),unitPrice:$.z.number().min(0),lotNumber:$.z.string().optional()})).min(1),packagingItems:$.z.array($.z.object({packagingTypeId:$.z.string().uuid(),quantityOut:$.z.number().int().min(0).default(0),quantityIn:$.z.number().int().min(0).default(0),unitPrice:$.z.number().min(0).default(0)})).optional()});function T(e){return new Intl.NumberFormat("fr-FR",{style:"currency",currency:"XOF",minimumFractionDigits:0}).format(e)}async function f(e){try{let t,a,n=await (0,I.auth)();if(!n?.user?.companyId)return g.NextResponse.json({error:"Non autorisé"},{status:401});let i=await e.json(),r=h.parse(i),{companyId:s}=n.user,o=await N.sql`
      SELECT id, name, credit_limit FROM clients
      WHERE id = ${r.clientId} AND company_id = ${s} AND is_active = true
    `;if(0===o.length)return g.NextResponse.json({error:"Client introuvable"},{status:404});if("credit"===r.paymentMethod){let e=await N.sql`
        SELECT COALESCE(SUM(balance), 0) as current_debt
        FROM client_accounts
        WHERE client_id = ${r.clientId} AND account_type = 'product'
      `,t=Math.abs(Number(e[0]?.current_debt||0)),a=Number(o[0].credit_limit),n=r.items.reduce((e,t)=>e+t.quantity*t.unitPrice,0)-r.paidAmount;if(a>0&&t+n>a)return g.NextResponse.json({error:`Plafond de cr\xe9dit d\xe9pass\xe9. Cr\xe9dit actuel: ${T(t)}, Limite: ${T(a)}`},{status:400})}let d=r.items.reduce((e,t)=>e+t.quantity*t.unitPrice,0),u=(r.packagingItems||[]).reduce((e,t)=>e+(t.quantityOut-t.quantityIn)*t.unitPrice,0),c=d+u,l=(t=new Date().toISOString().slice(0,10).replace(/-/g,""),a=Math.random().toString(36).substring(2,8).toUpperCase(),`VNT-${t}-${a}`),p=(await N.sql`
      INSERT INTO sales_orders (
        company_id, client_id, depot_id, order_number, status,
        order_source, subtotal, packaging_total, total_amount,
        paid_amount, payment_method, notes, created_by
      ) VALUES (
        ${s}, ${r.clientId}, ${r.depotId}, ${l},
        'confirmed', ${r.orderSource||"in_person"}, ${d},
        ${u}, ${c}, ${r.paidAmount},
        ${r.paymentMethod}, ${r.notes||null}, ${n.user.id}
      )
      RETURNING *
    `)[0];for(let e of r.items)await N.sql`
        INSERT INTO sales_order_items (
          sales_order_id, product_variant_id, quantity,
          unit_price, total_price, lot_number
        ) VALUES (
          ${p.id}, ${e.productVariantId}, ${e.quantity},
          ${e.unitPrice}, ${e.quantity*e.unitPrice},
          ${e.lotNumber||null}
        )
      `,await N.sql`
        UPDATE stock
        SET quantity = quantity - ${e.quantity}, updated_at = NOW()
        WHERE depot_id = ${r.depotId}
          AND product_variant_id = ${e.productVariantId}
          AND quantity >= ${e.quantity}
      `,await N.sql`
        INSERT INTO stock_movements (
          company_id, depot_id, product_variant_id,
          movement_type, quantity, reference_type, reference_id,
          lot_number, created_by
        ) VALUES (
          ${s}, ${r.depotId}, ${e.productVariantId},
          'sale', ${-e.quantity}, 'sales_order', ${p.id},
          ${e.lotNumber||null}, ${n.user.id}
        )
      `;if(r.packagingItems&&r.packagingItems.length>0)for(let e of r.packagingItems){await N.sql`
          INSERT INTO sales_order_packaging_items (
            sales_order_id, packaging_type_id,
            quantity_out, quantity_in, unit_price
          ) VALUES (
            ${p.id}, ${e.packagingTypeId},
            ${e.quantityOut}, ${e.quantityIn}, ${e.unitPrice}
          )
        `;let t=e.quantityOut-e.quantityIn;0!==t&&await N.sql`
            INSERT INTO packaging_transactions (
              company_id, client_id, sales_order_id,
              packaging_type_id, transaction_type, quantity,
              unit_price, total_amount, created_by
            ) VALUES (
              ${s}, ${r.clientId}, ${p.id},
              ${e.packagingTypeId},
              ${t>0?"given":"returned"},
              ${Math.abs(t)},
              ${e.unitPrice},
              ${Math.abs(t)*e.unitPrice},
              ${n.user.id}
            )
          `,e.quantityOut>0&&await N.sql`
            UPDATE packaging_stock
            SET quantity = quantity - ${e.quantityOut}, updated_at = NOW()
            WHERE depot_id = ${r.depotId}
              AND packaging_type_id = ${e.packagingTypeId}
          `,e.quantityIn>0&&await N.sql`
            UPDATE packaging_stock
            SET quantity = quantity + ${e.quantityIn}, updated_at = NOW()
            WHERE depot_id = ${r.depotId}
              AND packaging_type_id = ${e.packagingTypeId}
          `}let _=c-r.paidAmount;return _>0&&await N.sql`
        UPDATE client_accounts
        SET balance = balance - ${_}, last_transaction_at = NOW(), updated_at = NOW()
        WHERE client_id = ${r.clientId} AND account_type = 'product'
      `,u>0&&await N.sql`
        UPDATE client_accounts
        SET balance = balance - ${u}, last_transaction_at = NOW(), updated_at = NOW()
        WHERE client_id = ${r.clientId} AND account_type = 'packaging'
      `,r.paidAmount>0&&await N.sql`
        INSERT INTO payments (
          company_id, client_id, sales_order_id,
          amount, payment_method, payment_type, status, received_by
        ) VALUES (
          ${s}, ${r.clientId}, ${p.id},
          ${r.paidAmount}, ${r.paymentMethod}, 'product',
          'completed', ${n.user.id}
        )
      `,g.NextResponse.json({success:!0,data:p,message:"Vente créée avec succès"},{status:201})}catch(e){if(e instanceof $.z.ZodError)return g.NextResponse.json({error:"Données invalides",details:e.errors},{status:400});return console.error("Error creating sale:",e),g.NextResponse.json({error:"Erreur lors de la création de la vente"},{status:500})}}async function O(e){try{let t,a=await (0,I.auth)();if(!a?.user?.companyId)return g.NextResponse.json({error:"Non autorisé"},{status:401});let{searchParams:n}=new URL(e.url),i=n.get("status"),r=n.get("clientId"),s=parseInt(n.get("limit")||"100"),o=parseInt(n.get("offset")||"0");return t=i&&r?await N.sql`
        SELECT so.*, c.name as client_name
        FROM sales_orders so
        LEFT JOIN clients c ON so.client_id = c.id
        WHERE so.company_id = ${a.user.companyId}
          AND so.status = ${i}
          AND so.client_id = ${r}
        ORDER BY so.created_at DESC
        LIMIT ${s} OFFSET ${o}
      `:i?await N.sql`
        SELECT so.*, c.name as client_name
        FROM sales_orders so
        LEFT JOIN clients c ON so.client_id = c.id
        WHERE so.company_id = ${a.user.companyId}
          AND so.status = ${i}
        ORDER BY so.created_at DESC
        LIMIT ${s} OFFSET ${o}
      `:r?await N.sql`
        SELECT so.*, c.name as client_name
        FROM sales_orders so
        LEFT JOIN clients c ON so.client_id = c.id
        WHERE so.company_id = ${a.user.companyId}
          AND so.client_id = ${r}
        ORDER BY so.created_at DESC
        LIMIT ${s} OFFSET ${o}
      `:await N.sql`
        SELECT so.*, c.name as client_name
        FROM sales_orders so
        LEFT JOIN clients c ON so.client_id = c.id
        WHERE so.company_id = ${a.user.companyId}
        ORDER BY so.created_at DESC
        LIMIT ${s} OFFSET ${o}
      `,g.NextResponse.json({success:!0,data:t})}catch(e){return console.error("Error fetching sales:",e),g.NextResponse.json({error:"Erreur lors de la récupération des ventes"},{status:500})}}e.s(["GET",()=>O,"POST",()=>f],87690);var q=e.i(87690);let A=new t.AppRouteRouteModule({definition:{kind:a.RouteKind.APP_ROUTE,page:"/api/sales/route",pathname:"/api/sales",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/app/api/sales/route.ts",nextConfigOutput:"",userland:q}),{workAsyncStorage:v,workUnitAsyncStorage:w,serverHooks:S}=A;function b(){return(0,n.patchFetch)({workAsyncStorage:v,workUnitAsyncStorage:w})}async function C(e,t,n){A.isDev&&(0,i.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let g="/api/sales/route";g=g.replace(/\/index$/,"")||"/";let $=await A.prepare(e,t,{srcPage:g,multiZoneDraftMode:!1});if(!$)return t.statusCode=400,t.end("Bad Request"),null==n.waitUntil||n.waitUntil.call(n,Promise.resolve()),null;let{buildId:I,params:N,nextConfig:h,parsedUrl:T,isDraftMode:f,prerenderManifest:O,routerServerContext:q,isOnDemandRevalidate:v,revalidateOnlyGenerated:w,resolvedPathname:S,clientReferenceManifest:b,serverActionsManifest:C}=$,x=(0,o.normalizeAppPath)(g),D=!!(O.dynamicRoutes[x]||O.routes[S]),P=async()=>((null==q?void 0:q.render404)?await q.render404(e,t,T,!1):t.end("This page could not be found"),null);if(D&&!f){let e=!!O.routes[S],t=O.dynamicRoutes[x];if(t&&!1===t.fallback&&!e){if(h.experimental.adapterPath)return await P();throw new y.NoFallbackError}}let k=null;!D||A.isDev||f||(k="/index"===(k=S)?"/":k);let M=!0===A.isDev||!D,U=D&&!M;C&&b&&(0,s.setManifestsSingleton)({page:g,clientReferenceManifest:b,serverActionsManifest:C});let F=e.method||"GET",H=(0,r.getTracer)(),L=H.getActiveScopeSpan(),z={params:N,prerenderManifest:O,renderOpts:{experimental:{authInterrupts:!!h.experimental.authInterrupts},cacheComponents:!!h.cacheComponents,supportsDynamicResponse:M,incrementalCache:(0,i.getRequestMeta)(e,"incrementalCache"),cacheLifeProfiles:h.cacheLife,waitUntil:n.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,a,n,i)=>A.onRequestError(e,t,n,i,q)},sharedContext:{buildId:I}},j=new d.NodeNextRequest(e),W=new d.NodeNextResponse(t),V=u.NextRequestAdapter.fromNodeNextRequest(j,(0,u.signalFromNodeResponse)(t));try{let s=async e=>A.handle(V,z).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let a=H.getRootSpanAttributes();if(!a)return;if(a.get("next.span_type")!==c.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${a.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let n=a.get("next.route");if(n){let t=`${F} ${n}`;e.setAttributes({"next.route":n,"http.route":n,"next.span_name":t}),e.updateName(t)}else e.updateName(`${F} ${g}`)}),o=!!(0,i.getRequestMeta)(e,"minimalMode"),d=async i=>{var r,d;let u=async({previousCacheEntry:a})=>{try{if(!o&&v&&w&&!a)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let r=await s(i);e.fetchMetrics=z.renderOpts.fetchMetrics;let d=z.renderOpts.pendingWaitUntil;d&&n.waitUntil&&(n.waitUntil(d),d=void 0);let u=z.renderOpts.collectedTags;if(!D)return await (0,p.sendResponse)(j,W,r,z.renderOpts.pendingWaitUntil),null;{let e=await r.blob(),t=(0,_.toNodeOutgoingHttpHeaders)(r.headers);u&&(t[E.NEXT_CACHE_TAGS_HEADER]=u),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let a=void 0!==z.renderOpts.collectedRevalidate&&!(z.renderOpts.collectedRevalidate>=E.INFINITE_CACHE)&&z.renderOpts.collectedRevalidate,n=void 0===z.renderOpts.collectedExpire||z.renderOpts.collectedExpire>=E.INFINITE_CACHE?void 0:z.renderOpts.collectedExpire;return{value:{kind:R.CachedRouteKind.APP_ROUTE,status:r.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:a,expire:n}}}}catch(t){throw(null==a?void 0:a.isStale)&&await A.onRequestError(e,t,{routerKind:"App Router",routePath:g,routeType:"route",revalidateReason:(0,l.getRevalidateReason)({isStaticGeneration:U,isOnDemandRevalidate:v})},!1,q),t}},c=await A.handleResponse({req:e,nextConfig:h,cacheKey:k,routeKind:a.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:O,isRoutePPREnabled:!1,isOnDemandRevalidate:v,revalidateOnlyGenerated:w,responseGenerator:u,waitUntil:n.waitUntil,isMinimalMode:o});if(!D)return null;if((null==c||null==(r=c.value)?void 0:r.kind)!==R.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==c||null==(d=c.value)?void 0:d.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});o||t.setHeader("x-nextjs-cache",v?"REVALIDATED":c.isMiss?"MISS":c.isStale?"STALE":"HIT"),f&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let y=(0,_.fromNodeOutgoingHttpHeaders)(c.value.headers);return o&&D||y.delete(E.NEXT_CACHE_TAGS_HEADER),!c.cacheControl||t.getHeader("Cache-Control")||y.get("Cache-Control")||y.set("Cache-Control",(0,m.getCacheControlHeader)(c.cacheControl)),await (0,p.sendResponse)(j,W,new Response(c.value.body,{headers:y,status:c.value.status||200})),null};L?await d(L):await H.withPropagatedContext(e.headers,()=>H.trace(c.BaseServerSpan.handleRequest,{spanName:`${F} ${g}`,kind:r.SpanKind.SERVER,attributes:{"http.method":F,"http.target":e.url}},d))}catch(t){if(t instanceof y.NoFallbackError||await A.onRequestError(e,t,{routerKind:"App Router",routePath:x,routeType:"route",revalidateReason:(0,l.getRevalidateReason)({isStaticGeneration:U,isOnDemandRevalidate:v})},!1,q),D)throw t;return await (0,p.sendResponse)(j,W,new Response(null,{status:500})),null}}e.s(["handler",()=>C,"patchFetch",()=>b,"routeModule",()=>A,"serverHooks",()=>S,"workAsyncStorage",()=>v,"workUnitAsyncStorage",()=>w],13694)}];

//# sourceMappingURL=979b6_next_dist_esm_build_templates_app-route_ba9edc50.js.map