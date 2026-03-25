import { FastifyPluginAsync } from 'fastify';
import { Client } from 'ldapts';
import { getFullSettings } from '../services/secretManager';

export const ldapRoutes: FastifyPluginAsync = async (fastify) => {

  fastify.post('/api/ldap/sync-members', async (request, reply) => {
    try {
      const { ldap_team_name } = request.body as { ldap_team_name: string };
      if (!ldap_team_name) throw new Error('LDAP team name is required.');

      const settings = getFullSettings();
      const ldap = settings.ldap;

      if (!ldap?.url) throw new Error('LDAP URL is not configured.');
      if (!ldap?.team?.base_dn) throw new Error('LDAP Team Base DN is not configured.');
      if (!ldap?.team?.search_filter) throw new Error('LDAP Team Search Filter is not configured.');

      const searchFilter = ldap.team.search_filter.replace(/\{\{LDAP_TEAM_NAME\}\}/g, ldap_team_name);

      const client = new Client({ url: ldap.url });

      try {
        // Bind with credentials if provided
        if (ldap.bind_dn) {
          await client.bind(ldap.bind_dn, ldap.bind_password || '');
        }

        // Search for the team group entry
        const { searchEntries } = await client.search(ldap.team.base_dn, {
          filter: searchFilter,
          attributes: ['member'],
          scope: 'sub'
        });

        if (searchEntries.length === 0) {
          throw new Error(`No LDAP group found matching filter: ${searchFilter}`);
        }

        // Extract member DNs from the group entry
        const groupEntry = searchEntries[0];
        let memberDNs: string[] = [];
        if (groupEntry.member) {
          memberDNs = Array.isArray(groupEntry.member)
            ? groupEntry.member as string[]
            : [groupEntry.member as string];
        }

        // Resolve each member DN to get name and username
        const members: { name: string; username: string }[] = [];
        for (const dn of memberDNs) {
          try {
            const { searchEntries: memberEntries } = await client.search(dn, {
              filter: '(objectClass=*)',
              attributes: ['cn', 'sAMAccountName', 'uid', 'displayName'],
              scope: 'base'
            });

            if (memberEntries.length > 0) {
              const entry = memberEntries[0];
              const name = (entry.displayName || entry.cn || '') as string;
              const username = (entry.sAMAccountName || entry.uid || '') as string;
              if (username) {
                members.push({ name, username });
              }
            }
          } catch {
            // Skip members we can't resolve
            fastify.log.warn(`Could not resolve LDAP member DN: ${dn}`);
          }
        }

        return reply.send({ success: true, members });
      } finally {
        await client.unbind();
      }
    } catch (e: any) {
      return reply.code(500).send({ success: false, error: e.message });
    }
  });

};
