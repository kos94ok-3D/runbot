# -*- coding: utf-8 -*-
import datetime
import functools
import logging
import werkzeug

import werkzeug.utils
import werkzeug.urls

from collections import defaultdict
from werkzeug.exceptions import NotFound, Forbidden

from odoo.addons.http_routing.models.ir_http import slug
from odoo.addons.website.controllers.main import QueryURL

from odoo.http import Controller, Response, request, route as o_route
from odoo.osv import expression

_logger = logging.getLogger(__name__)


def route(routes, **kw):
    def decorator(f):
        @o_route(routes, **kw)
        @functools.wraps(f)
        def response_wrap(*args, **kwargs):
            projects = request.env['runbot.project'].search([])
            more = request.httprequest.cookies.get('more', False) == '1'
            filter_mode = request.httprequest.cookies.get('filter_mode', 'all')
            keep_search = request.httprequest.cookies.get('keep_search', False) == '1'
            cookie_search = request.httprequest.cookies.get('search', '')
            refresh = kwargs.get('refresh', False)
            kwargs['more'] = more
            kwargs['projects'] = projects

            response = f(*args, **kwargs)
            if isinstance(response, Response):
                if keep_search and cookie_search and 'search' not in kwargs:
                    search = cookie_search
                else:
                    search = kwargs.get('search', '')
                if keep_search and cookie_search != search:
                    response.set_cookie('search', search)

                project = response.qcontext.get('project') or projects[0]

                response.qcontext['projects'] = projects
                response.qcontext['more'] = more
                response.qcontext['keep_search'] = keep_search
                response.qcontext['search'] = search
                response.qcontext['current_path'] = request.httprequest.full_path
                response.qcontext['refresh'] = refresh
                response.qcontext['filter_mode'] = filter_mode
                response.qcontext['qu'] = QueryURL('/runbot/%s' % (slug(project)), path_args=['search'], search=search, refresh=refresh)
                if 'title' not in response.qcontext:
                    response.qcontext['title'] = 'Runbot %s' % project.name or ''

            return response
        return response_wrap
    return decorator


class Runbot(Controller):

    def _pending(self):
        ICP = request.env['ir.config_parameter'].sudo().get_param
        warn = int(ICP('runbot.pending.warning', 5))
        crit = int(ICP('runbot.pending.critical', 12))
        pending_count = request.env['runbot.build'].search_count([('local_state', '=', 'pending'), ('build_type', '!=', 'scheduled')])
        scheduled_count = request.env['runbot.build'].search_count([('local_state', '=', 'pending'), ('build_type', '=', 'scheduled')])
        level = ['info', 'warning', 'danger'][int(pending_count > warn) + int(pending_count > crit)]
        return pending_count, level, scheduled_count

    @o_route([
        '/runbot/submit'
    ], type='http', auth="public", methods=['GET', 'POST'], csrf=False)
    def submit(self, more=False, redirect='/', keep_search=False, category=False, filter_mode=False, update_triggers=False, **kwargs):
        response = werkzeug.utils.redirect(redirect)
        response.set_cookie('more', '1' if more else '0')
        response.set_cookie('keep_search', '1' if keep_search else '0')
        response.set_cookie('filter_mode', filter_mode or 'all')
        response.set_cookie('category', category or '0')
        if update_triggers:
            enabled_triggers = []
            project_id = int(update_triggers)
            for key in kwargs:
                if key.startswith('trigger_'):
                    enabled_triggers.append(key.replace('trigger_', ''))

            key = 'trigger_display_%s' % project_id
            if len(request.env['runbot.trigger'].search([('project_id', '=', project_id)])) == len(enabled_triggers):
                response.delete_cookie(key)
            else:
                response.set_cookie(key, '-'.join(enabled_triggers))
        return response

    def base_runbot_context(self, project_id):
        projects = request.env['runbot.project'].search([])
        projects_data = [{
            'id': p.id,
            'name': p.name,
            'slug': slug(p),
        } for p in request.env['runbot.project'].search([])]

        pending_count, level, scheduled_count = self._pending()
        hosts = request.env['runbot.host'].search([])
        load_infos = {
            'pending_total': pending_count,
            'pending_level': level,
            'scheduled_count': scheduled_count,
            'testing': hosts._total_testing(),
            'workers': hosts._total_workers(),
        }

        categories = request.env['runbot.category'].search([])
        categories_data = [{
            'id': category.id,
            'name': category.name,
            'icon': category.icon,
            'view_id': False, # TODO remove
        } for category in categories]


        nb_build_errors = request.env['runbot.build.error'].search_count([('random', '=', True), ('parent_id', '=', False)])
        nb_assigned_errors = request.env['runbot.build.error'].search_count([('responsible', '=', request.env.user.id)])

        triggers = request.env['runbot.trigger'].search([('project_id', 'in', projects.ids)])
        trigger_data = [{
            'id': trigger.id,
            'name': trigger.name,
            'project_id': trigger.project_id.id,
            'category_id': trigger.category_id.id,
            'manual': trigger.manual,
            'hide': trigger.hide,
        } for trigger in triggers]
    
        return {
            'data': {
                'default_category_id': request.env['ir.model.data'].xmlid_to_res_id('runbot.default_category'),
                'categories': categories_data,
                'load_infos': load_infos,
                'user': {
                    'id': request.env.user.id,
                    'name': request.env.user.name,
                    'public': request.env.user._is_public(),
                },
                'projects': projects_data,
                'project_id': project_id,
                'nb_build_errors': nb_build_errors,
                'nb_assigned_errors': nb_assigned_errors,
                'triggers': trigger_data,
            }
        }

    @route(['/',
            '/runbot',
            '/runbot/<model("runbot.project"):project>',
            '/runbot/<model("runbot.project"):project>/search/<search>'], website=True, auth='public', type='http')
    def main(self, project=None, search='', **kwargs): # todo refresh
        if not project:
            project = request.env['runbot.project'].search([], limit=1)
        res = request.render('runbot.main', self.base_runbot_context(project.id if project else False))
        return res

    @route(['/runbot/data/bundles/'], auth='public', type='json')
    def bundles(self, sticky=None, project_id=None, search='', **kwargs):
        search = search if len(search) < 60 else search[:60]
        env = request.env
        domain = [('last_batch', '!=', False), ('project_id', '=', project_id), ('no_build', '=', False)]

        if sticky is not None:
            domain.append(('sticky', '=', bool(sticky)))

        if search:
            search_domains = []
            pr_numbers = []
            for search_elem in search.split("|"):
                if search_elem.isnumeric():
                    pr_numbers.append(int(search_elem))
                else:
                    search_domains.append([('name', 'like', search_elem)])
            if pr_numbers:
                res = request.env['runbot.branch'].search([('name', 'in', pr_numbers)])
                if res:
                    search_domains.append([('id', 'in', res.mapped('bundle_id').ids)])
            search_domain = expression.OR(search_domains)
            domain = expression.AND([domain, search_domain])

        e = expression.expression(domain, request.env['runbot.bundle'])
        query = e.query
        query.order = """
            (case when "runbot_bundle".sticky then 1 when "runbot_bundle".sticky is null then 2 else 2 end),
                case when "runbot_bundle".sticky then "runbot_bundle".version_number end collate "C" desc,
                "runbot_bundle".last_batch desc
        """
        query.limit=40
        bundles = env['runbot.bundle'].browse(query)

        category_id = int(request.httprequest.cookies.get('category') or 0) or request.env['ir.model.data'].xmlid_to_res_id('runbot.default_category')
        # todo fixme
        bundles = bundles.with_context(category_id=category_id)
        bundles_data = []
        for bundle in bundles:
            last_batchs = []
            for batch in bundle.last_batchs:
                slot_ids = []
                for slot in batch.slot_ids:
                    slot_ids.append({
                        'id': slot.id,
                        'trigger_id': { # todo remove and use
                            'id': slot.trigger_id.id,
                            'name': slot.trigger_id.name,
                            'manual': slot.trigger_id.manual,
                            'hide': slot.trigger_id.hide,
                        },
                        'build_id': {
                            'id': slot.build_id.id,
                            'global_result': slot.build_id.global_result,
                            'global_state': slot.build_id.global_state,
                            'local_result': slot.build_id.local_result,
                            'local_state': slot.build_id.local_state,
                            'domain': slot.build_id.domain,
                            'dest': slot.build_id.dest,
                        },
                        'fa_link_type': slot.fa_link_type(),
                    })
                commit_link_ids = []
                for commit_link in batch.commit_link_ids:  # todo extract commit else where since they may be redundant
                    commit_link_ids.append({
                        'id': commit_link.id,
                        'match_type': commit_link.match_type,
                        'commit_id': commit_link.commit_id.id,
                        'commit_dname': commit_link.commit_id.dname,
                        'commit_subject': commit_link.commit_id.subject,
                        'commit_repo_sequence': commit_link.commit_id.repo_id.sequence,
                        'commit_repo_id': commit_link.commit_id.repo_id.id,
                        'commit_remote_url': commit_link.branch_id.remote_id.base_url,
                        'commit_name': commit_link.commit_id.name,
                    })
                last_batchs.append({
                    'id': batch.id,
                    'has_warning': batch.has_warning,
                    'state': batch.state,
                    'formated_age': batch.get_formated_age(),
                    'commit_link_ids': commit_link_ids,
                    'slot_ids': slot_ids,
                })

            branch_ids = []
            for branch in bundle.branch_ids.sorted(key=lambda b: (b.remote_id.repo_id.sequence, b.remote_id.repo_id.id, b.is_pr)):
                branch_ids.append({
                    'id': branch.id,
                    'name': branch.name,
                    'is_pr': branch.is_pr,
                    'alive': branch.alive,
                    'branch_url': branch.branch_url,
                    'remote_id': {
                        'remote_id' : branch.remote_id.id,
                        'short_name' : branch.remote_id.short_name,
                    }
                })
            categories = env['runbot.category'].search([])
            bundle_data = {
                'id': bundle.id,
                'sticky': bundle.sticky,
                'name': bundle.name,
                'last_batchs': last_batchs,
                'branch_ids': branch_ids,
            }
            if bundle.sticky:
                bundle_data['last_category_batch'] = {}
                for category in categories:
                    last_category_batch = bundle.with_context(category_id=category.id).last_done_batch
                    bundle_data['last_category_batch'][category.id] = last_category_batch.id

            bundles_data.append(bundle_data)
        response = {}
        response['bundles'] = bundles_data
        return response

    @route(['/runbot/data/custom_views/<batch_id_list>'], auth='public', type='json')
    def custom_category_views(self, batch_id_list='', **kwargs):
        batch_ids = [int(id) for id in batch_id_list.split(',')]
        view_render = {}
        for batch in request.env['runbot.batch'].browse(batch_ids):
            if batch.category_id.view_id:
                try:               
                    view_render[batch.id] = batch.category_id.view_id._render({
                        'category': batch.category_id,
                        'last_category_batch': batch
                    })
                except Exception as e:
                    _logger.error('Failed rendering custom view, %s', e)
        return view_render

    @route([
        '/runbot/bundle/<model("runbot.bundle"):bundle>',
        '/runbot/bundle/<model("runbot.bundle"):bundle>/page/<int:page>'
        ], website=True, auth='public', type='http')
    def bundle(self, bundle=None, page=1, limit=50, **kwargs):
        domain = [('bundle_id', '=', bundle.id), ('hidden', '=', False)]
        batch_count = request.env['runbot.batch'].search_count(domain)
        pager = request.website.pager(
            url='/runbot/bundle/%s' % bundle.id,
            total=batch_count,
            page=page,
            step=50,
        )
        batchs = request.env['runbot.batch'].search(domain, limit=limit, offset=pager.get('offset', 0), order='id desc')

        context = {
            'bundle': bundle,
            'batchs': batchs,
            'pager': pager,
            'project': bundle.project_id,
            'title': 'Bundle %s' % bundle.name
            }

        return request.render('runbot.bundle', context)

    @o_route([
        '/runbot/bundle/<model("runbot.bundle"):bundle>/force',
        '/runbot/bundle/<model("runbot.bundle"):bundle>/force/<int:auto_rebase>',
    ], type='http', auth="user", methods=['GET', 'POST'], csrf=False)
    def force_bundle(self, bundle, auto_rebase=False, **_post):
        _logger.info('user %s forcing bundle %s', request.env.user.name, bundle.name)  # user must be able to read bundle
        batch = bundle.sudo()._force()
        batch._log('Batch forced by %s', request.env.user.name)
        batch._prepare(auto_rebase)
        return werkzeug.utils.redirect('/runbot/batch/%s' % batch.id)

    @route(['/runbot/batch/<int:batch_id>'], website=True, auth='public', type='http')
    def batch(self, batch_id=None, **kwargs):
        batch = request.env['runbot.batch'].browse(batch_id)
        context = {
            'batch': batch,
            'project': batch.bundle_id.project_id,
            'title': 'Batch %s (%s)' % (batch.id, batch.bundle_id.name)
        }
        return request.render('runbot.batch', context)

    @o_route(['/runbot/batch/slot/<model("runbot.batch.slot"):slot>/build'], auth='user', type='http')
    def slot_create_build(self, slot=None, **kwargs):
        build = slot.sudo()._create_missing_build()
        return werkzeug.utils.redirect('/runbot/build/%s' % build.id)

    @route(['/runbot/commit/<model("runbot.commit"):commit>'], website=True, auth='public', type='http')
    def commit(self, commit=None, **kwargs):
        status_list = request.env['runbot.commit.status'].search([('commit_id', '=', commit.id)], order='id desc')
        last_status_by_context = dict()
        for status in status_list:
            if status.context in last_status_by_context:
                continue
            last_status_by_context[status.context] = status
        context = {
            'commit': commit,
            'project': commit.repo_id.project_id,
            'reflogs': request.env['runbot.ref.log'].search([('commit_id', '=', commit.id)]),
            'status_list': status_list,
            'last_status_by_context': last_status_by_context,
            'title': 'Commit %s' % commit.name[:8]
        }
        return request.render('runbot.commit', context)

    @o_route(['/runbot/commit/resend/<int:status_id>'], website=True, auth='user', type='http')
    def resend_status(self, status_id=None, **kwargs):
        CommitStatus = request.env['runbot.commit.status']
        status = CommitStatus.browse(status_id)
        if not status.exists():
            raise NotFound()
        last_status = CommitStatus.search([('commit_id', '=', status.commit_id.id), ('context', '=', status.context)], order='id desc', limit=1)
        if status != last_status:
            raise Forbidden("Only the last status can be resent")
        if not last_status.sent_date or (datetime.datetime.now() - last_status.sent_date).seconds > 60:  # ensure at least 60sec between two resend
            new_status = status.sudo().copy()
            new_status.description = 'Status resent by %s' % request.env.user.name
            new_status._send()
            _logger.info('github status %s resent by %s', status_id, request.env.user.name)
        return werkzeug.utils.redirect('/runbot/commit/%s' % status.commit_id.id)

    @o_route([
        '/runbot/build/<int:build_id>/<operation>',
    ], type='http', auth="public", methods=['POST'], csrf=False)
    def build_operations(self, build_id, operation, **post):
        build = request.env['runbot.build'].sudo().browse(build_id)
        if operation == 'rebuild':
            build = build._rebuild()
        elif operation == 'kill':
            build._ask_kill()
        elif operation == 'wakeup':
            build._wake_up()

        return werkzeug.utils.redirect(build.build_url)

    @o_route([
        '/runbot/owl.js',
    ], type='http', auth="public", methods=['GET'], csrf=False)
    def TODOREMOVE(self, **kwargs):
        import requests
        url = 'https://raw.githubusercontent.com/odoo/owl/owl-next-experiment/owl.js'
        r = requests.get(url)
        return r.content


    @route(['/runbot/build/<int:build_id>'], type='http', auth="public", website=True)
    def build(self, build_id, search=None, **post):
        """Events/Logs"""

        Build = request.env['runbot.build']

        build = Build.browse([build_id])[0]
        if not build.exists():
            return request.not_found()

        context = {
            'build': build,
            'default_category': request.env['ir.model.data'].xmlid_to_res_id('runbot.default_category'),
            'project': build.params_id.trigger_id.project_id,
            'title': 'Build %s' % build.id
        }
        return request.render("runbot.build", context)

    @route([
        '/runbot/branch/<model("runbot.branch"):branch>',
        ], website=True, auth='public', type='http')
    def branch(self, branch=None, **kwargs):
        pr_branch = branch.bundle_id.branch_ids.filtered(lambda rec: not rec.is_pr and rec.id != branch.id and rec.remote_id.repo_id == branch.remote_id.repo_id)[:1]
        branch_pr = branch.bundle_id.branch_ids.filtered(lambda rec: rec.is_pr and rec.id != branch.id and rec.remote_id.repo_id == branch.remote_id.repo_id)[:1]
        context = {
            'branch': branch,
            'project': branch.remote_id.repo_id.project_id,
            'title': 'Branch %s' % branch.name,
            'pr_branch': pr_branch,
            'branch_pr': branch_pr
            }

        return request.render('runbot.branch', context)

    @route([
        '/runbot/glances',
        '/runbot/glances/<int:project_id>'
        ], type='http', auth='public', website=True)
    def glances(self, project_id=None, **kwargs):
        project_ids = [project_id] if project_id else request.env['runbot.project'].search([]).ids # search for access rights
        bundles = request.env['runbot.bundle'].search([('sticky', '=', True), ('project_id', 'in', project_ids)])
        pending = self._pending()
        qctx = {
            'pending_total': pending[0],
            'pending_level': pending[1],
            'bundles': bundles,
            'title': 'Glances'
        }
        return request.render("runbot.glances", qctx)

    @route(['/runbot/monitoring',
            '/runbot/monitoring/<int:category_id>',
            '/runbot/monitoring/<int:category_id>/<int:view_id>'], type='http', auth='user', website=True)
    def monitoring(self, category_id=None, view_id=None, **kwargs):
        pending = self._pending()
        hosts_data = request.env['runbot.host'].search([])
        if category_id:
            category = request.env['runbot.category'].browse(category_id)
            assert category.exists()
        else:
            category = request.env.ref('runbot.nightly_category')
            category_id = category.id
        bundles = request.env['runbot.bundle'].search([('sticky', '=', True)])  # NOTE we dont filter on project
        qctx = {
            'category': category,
            'pending_total': pending[0],
            'pending_level': pending[1],
            'scheduled_count': pending[2],
            'bundles': bundles,
            'hosts_data': hosts_data,
            'auto_tags': request.env['runbot.build.error'].disabling_tags(),
            'build_errors': request.env['runbot.build.error'].search([('random', '=', True)]),
            'kwargs': kwargs,
            'title': 'monitoring'
        }
        return request.render(view_id if view_id else "runbot.monitoring", qctx)

    @route(['/runbot/errors',
            '/runbot/errors/page/<int:page>'], type='http', auth='user', website=True)
    def build_errors(self, error_id=None, sort=None, page=1, limit=20, **kwargs):
        sort_order_choices = {
            'last_seen_date desc': 'Last seen date: Newer First',
            'last_seen_date asc': 'Last seen date: Older First',
            'build_count desc': 'Number seen: High to Low',
            'build_count asc': 'Number seen: Low to High',
            'responsible asc': 'Assignee: A - Z',
            'responsible desc': 'Assignee: Z - A',
            'module_name asc': 'Module name: A - Z',
            'module_name desc': 'Module name: Z -A'
        }

        sort_order = sort if sort in sort_order_choices else 'last_seen_date desc'

        current_user_errors = request.env['runbot.build.error'].search([('responsible', '=', request.env.user.id)], order='last_seen_date desc, build_count desc')

        domain = [('parent_id', '=', False), ('responsible', '!=', request.env.user.id), ('build_count', '>', 1)]
        build_errors_count = request.env['runbot.build.error'].search_count(domain)
        url_args = {}
        url_args['sort'] = sort
        pager = request.website.pager(url='/runbot/errors/', url_args=url_args, total=build_errors_count, page=page, step=limit)

        build_errors = request.env['runbot.build.error'].search(domain, order=sort_order, limit=limit, offset=pager.get('offset', 0))

        qctx = {
            'current_user_errors': current_user_errors,
            'build_errors': build_errors,
            'title': 'Build Errors',
            'sort_order_choices': sort_order_choices,
            'pager': pager
        }
        return request.render('runbot.build_error', qctx)

    @route(['/runbot/build/stats/<int:build_id>'], type='http', auth="public", website=True)
    def build_stats(self, build_id, search=None, **post):
        """Build statistics"""

        Build = request.env['runbot.build']

        build = Build.browse([build_id])[0]
        if not build.exists():
            return request.not_found()

        build_stats = defaultdict(dict)
        for stat in build.stat_ids.filtered(lambda rec: '.' in rec.key).sorted(key=lambda  rec: rec.value, reverse=True):
            category, module = stat.key.split('.', maxsplit=1)
            value = int(stat.value) if stat.value == int(stat.value) else stat.value
            build_stats[category].update({module: value})

        context = {
            'build': build,
            'build_stats': build_stats,
            'default_category': request.env['ir.model.data'].xmlid_to_res_id('runbot.default_category'),
            'project': build.params_id.trigger_id.project_id,
            'title': 'Build %s statistics' % build.id
        }
        return request.render("runbot.build_stats", context)


    @route(['/runbot/stats/'], type='json', auth="public", website=False)
    def stats_json(self, bundle_id=False, trigger_id=False, key_category='', center_build_id=False, limit=100, search=None, **post):
        """ Json stats """
        trigger_id = trigger_id and int(trigger_id)
        bundle_id = bundle_id and int(bundle_id)
        center_build_id = center_build_id and int(center_build_id)
        limit = min(int(limit), 1000)

        trigger = request.env['runbot.trigger'].browse(trigger_id)
        bundle = request.env['runbot.bundle'].browse(bundle_id)
        if not trigger_id or not bundle_id or not trigger.exists() or not bundle.exists():
            return request.not_found()

        builds_domain = [
            ('global_state', 'in', ('running', 'done')), ('global_result', '=', 'ok'), ('slot_ids.batch_id.bundle_id', '=', bundle_id), ('params_id.trigger_id', '=', trigger.id),
        ]
        builds = request.env['runbot.build']
        if center_build_id:
            builds = builds.search(
                expression.AND([builds_domain, [('id', '>=', center_build_id)]]), 
                order='id', limit=limit/2)
            builds_domain = expression.AND([builds_domain, [('id', '<=', center_build_id)]])
            limit -= len(builds)

        builds |= builds.search(builds_domain, order='id desc', limit=limit)

        request.env.cr.execute("SELECT build_id, key, value FROM runbot_build_stat WHERE build_id IN %s AND key like %s", [tuple(builds.ids), '%s.%%' % key_category]) # read manually is way faster than using orm
        res = {}
        for (builds_id, key, value) in request.env.cr.fetchall():
            res.setdefault(builds_id, {})[key.split('.')[1]] = value
        return res

    @route(['/runbot/stats/<model("runbot.bundle"):bundle>/<model("runbot.trigger"):trigger>'], type='http', auth="public", website=True)
    def modules_stats(self, bundle, trigger, search=None, **post):
        """Modules statistics"""

        categories = request.env['runbot.build.stat.regex'].search([]).mapped('name')

        context = {
            'stats_categories': categories,
            'bundle': bundle,
            'trigger': trigger,
        }

        return request.render("runbot.modules_stats", context)
