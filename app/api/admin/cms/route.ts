import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin, logAdminAction } from '@/lib/admin-auth'
import { sql } from '@/lib/db'
import { handleRouteError, notFound } from '@/lib/errors'

/**
 * CMS de la landing — modèle « brouillon d'abord » :
 * tout élément créé ou modifié est enregistré en brouillon (is_published = false)
 * sauf si `publish: true` (« Enregistrer et publier »). Le public ne voit que les
 * éléments publiés ; l'aperçu (/preview/landing) montre aussi les brouillons.
 */

// GET /api/admin/cms — full CMS snapshot for back office
export async function GET() {
  const authz = await requireAdmin('cms.manage')
  if (!authz.ok) return authz.response

  try {
    const [sections, features, faq, testimonials, nav] = await Promise.all([
      sql`SELECT * FROM cms_sections ORDER BY sort_order ASC`,
      sql`SELECT * FROM cms_feature_modules ORDER BY sort_order ASC`,
      sql`SELECT * FROM cms_faq_items ORDER BY sort_order ASC`,
      sql`SELECT * FROM cms_testimonials ORDER BY sort_order ASC`,
      sql`SELECT * FROM cms_nav_links ORDER BY location ASC, sort_order ASC`,
    ])

    return NextResponse.json({
      success: true,
      data: { sections, features, faq, testimonials, nav },
    })
  } catch (e) {
    return handleRouteError(e, 'admin/cms GET')
  }
}

const sectionPatchSchema = z.object({
  type: z.literal('section'),
  section_key: z.string().min(1),
  title: z.string().nullable().optional(),
  subtitle: z.string().nullable().optional(),
  body: z.string().nullable().optional(),
  cta_primary_label: z.string().nullable().optional(),
  cta_primary_href: z.string().nullable().optional(),
  cta_secondary_label: z.string().nullable().optional(),
  cta_secondary_href: z.string().nullable().optional(),
  image_url: z.string().nullable().optional(),
  /** true = « Enregistrer et publier » ; sinon l'élément est enregistré en brouillon. */
  publish: z.boolean().optional(),
  meta: z.record(z.unknown()).optional(),
})

const faqSchema = z.object({
  type: z.literal('faq'),
  id: z.string().uuid().optional(),
  question: z.string().min(2),
  answer: z.string().min(2),
  sort_order: z.number().int().optional(),
  /** true = « Enregistrer et publier » ; sinon l'élément est enregistré en brouillon. */
  publish: z.boolean().optional(),
  delete: z.boolean().optional(),
})

const testimonialSchema = z.object({
  type: z.literal('testimonial'),
  id: z.string().uuid().optional(),
  author_name: z.string().min(2),
  author_role: z.string().nullable().optional(),
  company_name: z.string().nullable().optional(),
  quote: z.string().min(2),
  rating: z.number().int().min(1).max(5).optional(),
  sort_order: z.number().int().optional(),
  /** true = « Enregistrer et publier » ; sinon l'élément est enregistré en brouillon. */
  publish: z.boolean().optional(),
  delete: z.boolean().optional(),
})

const featureSchema = z.object({
  type: z.literal('feature'),
  id: z.string().uuid().optional(),
  slug: z.string().min(1).optional(),
  title: z.string().min(2),
  description: z.string().nullable().optional(),
  icon: z.string().optional(),
  highlight: z.string().nullable().optional(),
  sort_order: z.number().int().optional(),
  /** true = « Enregistrer et publier » ; sinon l'élément est enregistré en brouillon. */
  publish: z.boolean().optional(),
  delete: z.boolean().optional(),
})

const ENTITIES = ['section', 'feature', 'faq', 'testimonial'] as const

/** Publier / dépublier un élément sans modifier son contenu. */
const publishSchema = z.object({
  type: z.literal('publish'),
  entity: z.enum(ENTITIES),
  /** uuid (feature, faq, testimonial) ou section_key (section) */
  id: z.string().min(1),
  published: z.boolean(),
})

/** Publier tous les brouillons d'un coup. */
const publishAllSchema = z.object({ type: z.literal('publish_all') })

const bodySchema = z.discriminatedUnion('type', [
  sectionPatchSchema,
  faqSchema,
  testimonialSchema,
  featureSchema,
  publishSchema,
  publishAllSchema,
])

async function setPublished(entity: (typeof ENTITIES)[number], id: string, published: boolean): Promise<number> {
  let rows: unknown[]
  if (entity === 'section') {
    rows = await sql`UPDATE cms_sections SET is_published = ${published}, updated_at = NOW() WHERE section_key = ${id} RETURNING section_key`
  } else if (entity === 'feature') {
    rows = await sql`UPDATE cms_feature_modules SET is_published = ${published}, updated_at = NOW() WHERE id = ${id} RETURNING id`
  } else if (entity === 'faq') {
    rows = await sql`UPDATE cms_faq_items SET is_published = ${published}, updated_at = NOW() WHERE id = ${id} RETURNING id`
  } else {
    rows = await sql`UPDATE cms_testimonials SET is_published = ${published}, updated_at = NOW() WHERE id = ${id} RETURNING id`
  }
  return rows.length
}

// PATCH /api/admin/cms — update one CMS entity
export async function PATCH(request: NextRequest) {
  const authz = await requireAdmin('cms.manage')
  if (!authz.ok) return authz.response

  try {
    const json = await request.json()
    const data = bodySchema.parse(json)

    if (data.type === 'publish') {
      const updated = await setPublished(data.entity, data.id, data.published)
      if (!updated) throw notFound('Élément')
      await logAdminAction(
        authz.adminId,
        authz.adminEmail,
        data.published ? 'cms.publish' : 'cms.unpublish',
        `cms_${data.entity}`,
        data.id
      )
      return NextResponse.json({ success: true })
    }

    if (data.type === 'publish_all') {
      const counts = await Promise.all([
        sql`UPDATE cms_sections SET is_published = true, updated_at = NOW() WHERE is_published = false RETURNING section_key`,
        sql`UPDATE cms_feature_modules SET is_published = true, updated_at = NOW() WHERE is_published = false RETURNING id`,
        sql`UPDATE cms_faq_items SET is_published = true, updated_at = NOW() WHERE is_published = false RETURNING id`,
        sql`UPDATE cms_testimonials SET is_published = true, updated_at = NOW() WHERE is_published = false RETURNING id`,
      ])
      const published = counts.reduce((n, rows) => n + rows.length, 0)
      await logAdminAction(authz.adminId, authz.adminEmail, 'cms.publish_all', 'cms', null, { published })
      return NextResponse.json({ success: true, data: { published } })
    }

    // Brouillon par défaut : seul « Enregistrer et publier » rend l'élément visible du public
    const isPublished = data.publish === true

    if (data.type === 'section') {
      await sql`
        UPDATE cms_sections SET
          title = COALESCE(${data.title ?? null}, title),
          subtitle = COALESCE(${data.subtitle ?? null}, subtitle),
          body = COALESCE(${data.body ?? null}, body),
          cta_primary_label = COALESCE(${data.cta_primary_label ?? null}, cta_primary_label),
          cta_primary_href = COALESCE(${data.cta_primary_href ?? null}, cta_primary_href),
          cta_secondary_label = COALESCE(${data.cta_secondary_label ?? null}, cta_secondary_label),
          cta_secondary_href = COALESCE(${data.cta_secondary_href ?? null}, cta_secondary_href),
          image_url = COALESCE(${data.image_url ?? null}, image_url),
          is_published = ${isPublished},
          meta = COALESCE(${data.meta ? JSON.stringify(data.meta) : null}::jsonb, meta),
          updated_at = NOW(),
          updated_by = ${authz.adminId}
        WHERE section_key = ${data.section_key}
      `
      await logAdminAction(
        authz.adminId,
        authz.adminEmail,
        'cms.section.update',
        'cms_section',
        data.section_key,
        { published: isPublished }
      )
      return NextResponse.json({ success: true })
    }

    if (data.type === 'faq') {
      if (data.delete && data.id) {
        await sql`DELETE FROM cms_faq_items WHERE id = ${data.id}`
        await logAdminAction(authz.adminId, authz.adminEmail, 'cms.faq.delete', 'cms_faq', data.id)
        return NextResponse.json({ success: true })
      }
      if (data.id) {
        await sql`
          UPDATE cms_faq_items SET
            question = ${data.question},
            answer = ${data.answer},
            sort_order = COALESCE(${data.sort_order ?? null}, sort_order),
            is_published = ${isPublished},
            updated_at = NOW()
          WHERE id = ${data.id}
        `
      } else {
        await sql`
          INSERT INTO cms_faq_items (question, answer, sort_order, is_published)
          VALUES (
            ${data.question},
            ${data.answer},
            ${data.sort_order ?? 0},
            ${isPublished}
          )
        `
      }
      await logAdminAction(authz.adminId, authz.adminEmail, 'cms.faq.upsert', 'cms_faq', data.id ?? null)
      return NextResponse.json({ success: true })
    }

    if (data.type === 'testimonial') {
      if (data.delete && data.id) {
        await sql`DELETE FROM cms_testimonials WHERE id = ${data.id}`
        await logAdminAction(
          authz.adminId,
          authz.adminEmail,
          'cms.testimonial.delete',
          'cms_testimonial',
          data.id
        )
        return NextResponse.json({ success: true })
      }
      if (data.id) {
        await sql`
          UPDATE cms_testimonials SET
            author_name = ${data.author_name},
            author_role = ${data.author_role ?? null},
            company_name = ${data.company_name ?? null},
            quote = ${data.quote},
            rating = COALESCE(${data.rating ?? null}, rating),
            sort_order = COALESCE(${data.sort_order ?? null}, sort_order),
            is_published = ${isPublished},
            updated_at = NOW()
          WHERE id = ${data.id}
        `
      } else {
        await sql`
          INSERT INTO cms_testimonials
            (author_name, author_role, company_name, quote, rating, sort_order, is_published)
          VALUES (
            ${data.author_name},
            ${data.author_role ?? null},
            ${data.company_name ?? null},
            ${data.quote},
            ${data.rating ?? 5},
            ${data.sort_order ?? 0},
            ${isPublished}
          )
        `
      }
      await logAdminAction(
        authz.adminId,
        authz.adminEmail,
        'cms.testimonial.upsert',
        'cms_testimonial',
        data.id ?? null
      )
      return NextResponse.json({ success: true })
    }

    // feature
    if (data.delete && data.id) {
      await sql`DELETE FROM cms_feature_modules WHERE id = ${data.id}`
      await logAdminAction(
        authz.adminId,
        authz.adminEmail,
        'cms.feature.delete',
        'cms_feature',
        data.id
      )
      return NextResponse.json({ success: true })
    }
    if (data.id) {
      await sql`
        UPDATE cms_feature_modules SET
          title = ${data.title},
          description = ${data.description ?? null},
          icon = COALESCE(${data.icon ?? null}, icon),
          highlight = ${data.highlight ?? null},
          sort_order = COALESCE(${data.sort_order ?? null}, sort_order),
          is_published = ${isPublished},
          updated_at = NOW()
        WHERE id = ${data.id}
      `
    } else {
      const slug =
        data.slug ||
        data.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
      await sql`
        INSERT INTO cms_feature_modules
          (slug, title, description, icon, highlight, sort_order, is_published)
        VALUES (
          ${slug},
          ${data.title},
          ${data.description ?? null},
          ${data.icon || 'box'},
          ${data.highlight ?? null},
          ${data.sort_order ?? 0},
          ${isPublished}
        )
      `
    }
    await logAdminAction(
      authz.adminId,
      authz.adminEmail,
      'cms.feature.upsert',
      'cms_feature',
      data.id ?? null
    )
    return NextResponse.json({ success: true })
  } catch (e) {
    return handleRouteError(e, 'admin/cms PATCH')
  }
}
