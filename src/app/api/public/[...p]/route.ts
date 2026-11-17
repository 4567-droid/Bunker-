import { bizNow, getService, listDays, listSlots, liveStatus } from '@/lib/booking';
import { currentBusiness } from '@/lib/business';
import { tenantTx } from '@/lib/db';
import { firstName } from '@/lib/format';
import { json, notFound, route } from '@/lib/http';
import { getPublicConfig } from '@/lib/public-config';

export const dynamic = 'force-dynamic';

export const GET = route(async (req, [action]) => {
  const biz = await currentBusiness();
  const q = new URL(req.url).searchParams;
  const now = bizNow(biz);

  switch (action) {
    case 'config':
      return json(await getPublicConfig(biz));

    case 'live':
      return json(await tenantTx(biz.id, (tx) => liveStatus(tx, biz, now)));

    case 'days':
      return json(
        await tenantTx(biz.id, async (tx) => {
          const service = await getService(tx, biz.id, q.get('service'));
          return { today: now.day, days: await listDays(tx, biz, service, now) };
        }),
      );

    case 'slots':
      return json(
        await tenantTx(biz.id, async (tx) => {
          const service = await getService(tx, biz.id, q.get('service'));
          return { day: q.get('day'), slots: await listSlots(tx, biz, service, q.get('day') ?? '', now) };
        }),
      );

    case 'referral': {
      const code = (q.get('code') ?? '').trim().toUpperCase().slice(0, 20);
      if (!code) return json({ valid: false });
      const rows = await tenantTx(biz.id, (tx) => tx<{ name: string }[]>`
        select name from clients where business_id = ${biz.id} and referral_code = ${code}`);
      return json(rows[0] ? { valid: true, code, name: firstName(rows[0].name), percent: biz.referral_percent } : { valid: false });
    }
  }
  notFound();
});
