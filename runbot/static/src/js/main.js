const { Component } = owl;
const { xml } = owl.tags;
const { whenReady } = owl.utils;
const { useState } = owl.hooks;

get_color_class = function(build) {

    if (build.global_result == 'ko')
        return 'danger'
    if (build.global_result == 'warn')
        return 'warning'

    if (build.global_state == 'pending')
        return 'default'
    if (('testing', 'waiting').indexOf(build.global_state) != -1)
        return 'info'

    if (build.global_result == 'ok')
        return 'success'

    if (('skipped', 'killed', 'manually_killed').indexOf(build.global_result) != -1)
        return 'killed'

}



const BRANCH_INFOS_TEMPLATE = `
<t>
    <button t-attf-class="btn btn-default btn-ssm" data-toggle="dropdown" title="Github links" aria-label="Github links" aria-expanded="false">
        
        <i t-attf-class="fa fa-github {{bundle.branch_ids.some((branch) => branch.is_pr &amp;&amp; branch.alive) ? 'text-primary' : ''}}"/>
        <span class="caret"/>
    </button>
    <div  class="dropdown-menu" role="menu">
        <t t-foreach="bundle.branch_ids" t-as="branch" t-key="branch.id">
        <t t-set="link_title" t-value="'View ' + (branch.is_pr ? 'PR' : 'Branch') + ' ' + branch.name + ' on Github'"/>
        <a t-att-href="branch.branch_url" class="dropdown-item" t-att-title="link_title"><span class="font-italic text-muted"><t t-esc="branch.remote_id.short_name"/></span> <t t-esc="branch.name"/></a>
        </t>
    </div>
</t>
`

    
const LOAD_INFOS_TEMPLATE = xml /* xml */`
<span class="pull-right">
    <span t-attf-class="badge badge-{{load_infos.pending_level}}">
        Pending:
        <t t-esc="load_infos.pending_total"/>
    </span>
    <t t-set="klass">success</t>
    <t t-if="! load_infos.workers" t-set="klass">danger</t>
    <t t-else="">
        <t t-if="load_infos.testing/load_infos.workers > 0" t-set="klass">info</t>
        <t t-if="load_infos.testing/load_infos.workers > 0.75" t-set="klass">warning</t>
        <t t-if="load_infos.testing/load_infos.workers >= 1" t-set="klass">danger</t>
    </t>
    <span t-attf-class="badge badge-{{klass}}">
        Testing:
        <t t-esc="load_infos.testing"/>
        /
        <t t-esc="load_infos.workers"/>
    </span>
</span>
`;

class LoadInfos extends Component {
    static template = LOAD_INFOS_TEMPLATE;
    willStart() {
        this.load_infos = this.props.load_infos
    }
}

const COPY_BUTTON_TEMPLATE = xml /* xml */`
<button t-attf-class="btn btn-default btn-ssm" title="Copy Bundle name" aria-label="Copy Bundle name">
    <i t-attf-class="fa fa-clipboard"/>
</button>
    `;

class CopyButton extends Component {
    static template = COPY_BUTTON_TEMPLATE;
    willStart() {
        this.bundle = this.props.bundle
    }
    copyToClipboard() {}

    //todo t-attf-onclick="copyToClipboard('{{ bundle.name.split(':')[-1] }}')
}
       

const BUILD_MENU_TEMPLATE = `
<t>
    <button t-attf-class="btn btn-default dropdown-toggle" data-toggle="dropdown" title="Build options" aria-label="Build options" aria-expanded="false">
        <i t-attf-class="fa {{build.global_state == 'pending' ? 'fa-spinner' : 'fa-cog'}} {{('done', 'running').indexOf(build.global_state) == -1 ? '' : 'fa-spin'}} fa-fw"/>
        <span class="caret"/>
    </button>
    <div class="dropdown-menu dropdown-menu-right" role="menu">
        <a t-if="build.global_result=='skipped'" groups="runbot.group_runbot_admin" class="dropdown-item" href="#" data-runbot="rebuild" t-att-data-runbot-build="build.id">
            <i class="fa fa-level-up"/>
            Force Build
        </a>
        <t t-if="build.local_state=='running'">
            <a class="dropdown-item" t-attf-href="http://{{build.domain}}/?db={{build.dest}}-all">
                <i class="fa fa-sign-in"/>
                Connect all
            </a>
            <a class="dropdown-item" t-attf-href="http://{{build.domain}}/?db={{build.dest}}-base">
                <i class="fa fa-sign-in"/>
                Connect base
            </a>
            <a class="dropdown-item" t-attf-href="http://{{build.domain}}/">
                <i class="fa fa-sign-in"/>
                Connect
            </a>
        </t>
        <a class="dropdown-item" t-if="['done','running'].indexOf(build.global_state) !== -1 or requested_action == 'deathrow'" groups="base.group_user" href="#" data-runbot="rebuild" t-att-data-runbot-build="build.id" title="Retry this build, usefull for false positive">
            <i class="fa fa-refresh"/>
            Rebuild
        </a>
        <t t-if="build.global_state != 'done'">
            <t t-if="build.requested_action != 'deathrow'">
                <a groups="base.group_user" href="#" data-runbot="kill" class="dropdown-item" t-att-data-runbot-build="build.id">
                    <i class="fa fa-crosshairs"/>
                    Kill
                </a>
            </t>
            <t t-else="">
                <a groups="base.group_user" data-runbot="kill" class="dropdown-item disabled">
                    <i class="fa fa-spinner fa-spin"/>
                    Killing
                    <i class="fa fa-crosshairs"/>
                </a>
            </t>
        </t>
        <t t-if="build.global_state == 'done'">
            <t t-if="build.requested_action != 'wake_up'">
                <a groups="base.group_user" class="dropdown-item" href="#" data-runbot="wakeup" t-att-data-runbot-build="build.id">
                    <i class="fa fa-coffee"/>
                    Wake up
                </a>
            </t>
            <t t-else="">
                <a groups="base.group_user" class="dropdown-item disabled" data-runbot="wakeup">
                    <i class="fa fa-spinner fa-spin"/>
                    Waking up
                    <i class="fa fa-crosshairs"/>
                </a>
            </t>
        </t>
        <div t-if="('testing', 'waiting', 'pending').indexOf(build.global_state) != -1" groups="base.group_user" class="dropdown-divider"/>
        <t t-if="build.log_list">
            <t t-foreach="build.log_list.split(',')" t-as="log_name" t-key="log_name">
                <a class="dropdown-item" t-attf-href="http://{{build.host}}/runbot/static/build/{{build.dest}}/logs/{{log_name}}.txt">
                    <i class="fa fa-file-text-o"/>
                    Full
                    <t t-esc="log_name"/>
                    logs
                </a>
            </t>
        </t>
        <t groups="runbot.group_runbot_admin">
            <div class="dropdown-divider"/>
            <a class="dropdown-item" t-attf-href="/web/#id={{build.id}}&amp;view_type=form&amp;model=runbot.build" target="new">
                <i class="fa fa-list"/>
                View in backend
            </a>
        </t>
    </div>
</t>`;


/*class BuildMenu extends Component {
    static template = BUILD_MENU_TEMPLATE;
    willStart() {
        this.build=this.props.build;
    }
}*/


const SLOT_BUTTON_TEMPLATE = xml /* xml */`
<div t-attf-class="btn-group btn-group-ssm slot_button_group">
    <span t-attf-class="btn btn-{{color}} disabled" t-att-title="slot.link_type">
        <i t-attf-class="fa fa-{{slot.fa_link_type}}"/>
    </span>
    <a t-if="build" t-attf-href="/runbot/build/{{build.id}}" t-attf-class="btn btn-default slot_name">
        <span t-esc="slot.trigger_id.name"/>
    </a>
    <span t-else="" t-attf-class="btn btn-default disabled slot_name">
        <span t-esc="slot.trigger_id.name"/>
    </span>
    <a t-if="build.local_state == 'running'" t-attf-href="http://{{build.domain}}/" class="fa fa-sign-in btn btn-info"/>
    <t t-call="BuildMenu"/>
    <a t-if="! build" class="btn btn-default" title="Create build" t-attf-href="/runbot/batch/slot/{{slot.id}}/build">
        <i class="fa fa-play fa-fw"/>
    </a>
</div>
    `;

class SlotButton extends Component {
    static template = SLOT_BUTTON_TEMPLATE;
    willStart() {
        this.slot = this.props.slot
        this.build = this.slot.build_id;
        this.color = get_color_class(this.build);
    }
}

const BATCH_TILE_TEMPLATE = xml /* xml */`
<div t-attf-class="batch_tile {{options.more? 'more' : 'nomore'}}">
    <div t-attf-class="card bg-{{klass}}-light">
        <div class="batch_header">
            <a t-attf-href="/runbot/batch/{{batch.id}}" t-attf-class="badge badge-{{batch.has_warning ? 'warning' : 'light'}}" title="View Batch">
                <t t-esc="batch.formated_age"/>
                <i class="fa fa-exclamation-triangle" t-if="batch.has_warning"/>
                <i class="arrow fa fa-window-maximize"/>
            </a>
        </div>
        <t t-if="batch.state=='preparing'">
            <span><i class="fa fa-cog fa-spin fa-fw"/> preparing</span>
        </t>
        <div class="batch_slots">
            <t t-foreach="displayableSlots" t-as="slot" t-key="slot.id">
                <SlotButton class="slot_container" slot="slot"/>
            </t>
            <div class="slot_filler" t-foreach="Array(10).keys()" t-as="x" t-key="x"/>
        </div>
        <div class="batch_commits">
            <div t-foreach="commit_links" t-as="commit_link" class="one_line" t-key="commit_link.id">
                <a t-attf-href="/runbot/commit/{{commit_link.commit_id}}" t-attf-class="badge badge-light batch_commit match_type_{{commit_link.match_type}}">
                <i class="fa fa-fw fa-hashtag" t-if="commit_link.match_type == 'new'" title="This commit is a new head"/>
                <i class="fa fa-fw fa-link" t-if="commit_link.match_type == 'head'" title="This commit is an existing head from bundle branches"/>
                <i class="fa fa-fw fa-code-fork" t-if="commit_link.match_type == 'base_match'" title="This commit is matched from a base batch with matching merge_base"/>
                <i class="fa fa-fw fa-clock-o" t-if="commit_link.match_type == 'base_head'" title="This commit is the head of a base branch"/>
                <t t-esc="commit_link.commit_dname"/>
                </a>
                <a t-att-href="'https://%s/commit/%s' % (commit_link.commit_remote_url, commit_link.commit_name)" class="badge badge-light" title="View Commit on Github"><i class="fa fa-github"/></a>
                <span t-esc="commit_link.commit_subject"/>
            </div>
        </div>
        
        
    </div>
</div>`;

class BatchTile extends Component {
    static template = BATCH_TILE_TEMPLATE;
    static components = { SlotButton };
    static trigger_display = false; // TODO
    options = Component.env.options
    
    //  <t t-if=="()">
    willStart() {
        this.batch = this.props.batch
        this.klass = "info";
        this.trigger_display = null; // TODO
        this.displayableSlots = this.batch.slot_ids.filter(
            slot => slot.build_id.id && !slot.trigger_id.manual && ((! slot.trigger_id.hide && this.trigger_display === null) || (this.trigger_display && this.trigger_display.indexOf(slot.trigger_id.id) != -1))
        );

        this.commit_links = [...this.batch.commit_link_ids]
        this.commit_links.sort(cl => (cl.commit_repo_sequence, cl.commit_repo_id))
        if (this.batch.state == "skipped") {
            this.klass = "killed";
        } else if (this.batch.state=='done') {
            if (this.batch.slot_ids.every((slot) => ! slot.build_id.id || slot.build_id.global_result == 'ok')) {
                this.klass = "success";
            } else {
                this.klass = "danger";
            }
        }
    }

}


const BUNDLES_TEMPLATE = xml /* xml */`
<div>
    <div
        t-foreach="props.bundles"
        t-as="bundle"
        t-key="bundle.id"
        class="row bundle_row"
        t-if="props.search.value.split('|').some((s)=> bundle.name.indexOf(s) !== -1 || bundle.branch_ids.some((branch) => branch.name.indexOf(s) !== -1))">
        <div class="col-md-3 col-lg-2 cell">
            <div class="one_line">
                <i t-if="bundle.sticky" class="fa fa-star" style="color: #f0ad4e" />
                <a t-attf-href="/runbot/bundle/{{bundle.id}}" t-att-title="bundle.name">
                <b t-esc="bundle.name"/>
                </a>
            </div>
            <div class="btn-toolbar" role="toolbar" aria-label="Toolbar with button groups">
                <div class="btn-group" role="group">
                <t t-foreach="categories" t-as="category" t-key="category.id">
                    <t t-if="active_category_id != category.id">
                        <t t-set="last_category_batch_id" t-if="bundle.last_category_batch" t-value="bundle.last_category_batch[category.id]"/>
                        <t t-if="last_category_batch_id">
                            <t t-set="category_custom_view" t-value="props.category_custom_views[last_category_batch_id]"/>
                            <t t-if="category_custom_view" t-raw="category_custom_view"/>
                            <a t-else=""
                                t-attf-title="View last {{category.name}} batch"
                                t-attf-href="/runbot/batch/{{last_category_batch_id}}"
                                t-attf-class="btn btn-ssm btn-default fa fa-{{category.icon}}"
                            />
                        </t>
                    </t>
                </t>
                </div>
                <div>
                    <CopyButton t-if="!bundle.sticky" bundle="bundle"/>
                    
                    <t t-call="BranchInfo"/>
                </div>
            </div>
        </div>
        <div class="col-md-9 col-lg-10">
            <div class="row no-gutters">
                <div t-foreach="bundle.last_batchs" t-as="batch" t-key="batch.id" t-attf-class="col-md-6 col-xl-3 {{batch_index > 1 ? 'd-none d-xl-block' : ''}}">
                    <BatchTile batch="batch"/>
                </div>
            </div>
        </div>
    </div>
</div>`

class BundlesList extends Component {
    static template = BUNDLES_TEMPLATE;
    static components = { CopyButton, BatchTile };
    categories = base_data.categories;
    active_category_id = base_data.default_category_id;
    options = Component.env.options
}

const APP_TEMPLATE = xml /* xml */`
<div id="wrapwrap">
    <header>
        <nav class="navbar navbar-expand-md navbar-light bg-light">
            <a t-attf-href="/runbot/{{project.slug}}">
                <b style="color:#777;">
                    <t t-esc="project.name"/>
                </b>
            </a>
            <button type="button" class="navbar-toggler" data-toggle="collapse" data-target="#top_menu_collapse">
                <span class="navbar-toggler-icon"></span>
            </button>
            <div class="collapse navbar-collapse" id="top_menu_collapse" aria-expanded="false">
                <ul class="nav navbar-nav ml-auto text-right" id="top_menu">
                    <li class="nav-item" t-foreach="projects" t-as="project" t-key="project.id">
                        <a class="nav-link" href="#" t-on-click="selectProject(project)">
                            <t t-esc="project.name"/>
                        </a>
                    </li>
                        
                    <li class="nav-item divider"></li>
                    <t t-if="user">
                        <t t-if="user.public">
                            <li class="nav-item dropdown">
                                <b>
                                    <a class="nav-link" t-attf-href="/web/login?redirect=/">Login</a>
                                </b>
                            </li>
                        </t>
                        <t t-else="">
                            <t t-if="nb_assigned_errors and nb_assigned_errors > 0">
                                <li class="nav-item divider"/>
                                <li class="nav-item">
                                    <a href="/runbot/errors" class="nav-link text-danger" t-attf-title="You have {{nb_assigned_errors}} random bug assigned">
                                        <i class="fa fa-bug"/><t t-esc="nb_assigned_errors"/>
                                    </a>
                                </li>
                            </t>
                            <t t-elif="nb_build_errors and nb_build_errors > 0">
                                <li class="nav-item divider"/>
                                <li class="nav-item">
                                    <a href="/runbot/errors" class="nav-link" title="Random Bugs"><i class="fa fa-bug"/></a>
                                </li>
                            </t>
                            <li class="nav-item dropdown">
                                <a href="#" class="nav-link dropdown-toggle" data-toggle="dropdown">
                                    <b>
                                        <span t-esc=" user.name.length &gt; 25 ? user.namesubstring(0, 23) + '...' : user.name"/>
                                    </b>
                                </a>
                                <div class="dropdown-menu js_usermenu" role="menu">
                                    <a class="dropdown-item" id="o_logout" role="menuitem" t-attf-href="/web/session/logout?redirect=/">Logout</a>
                                    <a class="dropdown-item" role="menuitem" t-attf-href="/web">Web</a>
                                </div>
                            </li>
                        </t>
                    </t>
                    <li class="nav-item"><a class="nav-link" href="/doc">FAQ</a></li><!--todo this is a custom xpath-->
                </ul>
                    
                <div class="form-inline my-2 my-lg-0" role="search">
                    <div class="input-group md-form form-sm form-2 pl-0">
                        <input class="form-control my-0 py-1 red-border" type="text" placeholder="Search" aria-label="Search" name="search" t-att-value="search.value" t-on-keyup="updateFilter"/>
                        <div class="input-group-append">
                        </div>
                    </div>
                </div>
            </div>
        </nav>
    </header>

    <div class="container-fluid frontend">
        <div class="row">
            <div class='col-md-12'>
                <LoadInfos load_infos="load_infos" t-if="load_infos"/>
            </div>
            <div class='col-md-12'>
                <div t-if="message" class="alert alert-warning" role="alert">
                    <t t-esc="message" /> <!-- todo fixme-->
                </div>
                <div t-if="! project" class="mb32">
                    <h1>No project</h1>
                </div>
                <div t-else="">
                    <BundlesList bundles="bundles.sticky" category_custom_views="category_custom_views" search="search"/>
                    <BundlesList bundles="bundles.dev" search="search"/>
                </div>
            </div>
        </div>
    </div>
</div>`;

class App extends Component {
    static template = APP_TEMPLATE;
    static components = { BundlesList, LoadInfos };
    bundles = useState({
        sticky:[],
        dev:[],
    });
    category_custom_views = useState({});
    
    search = useState({value: ""})
    project = base_data.project
    projects = base_data.projects
    user = base_data.user;
    load_infos = base_data.load_infos;
    nb_build_errors = base_data.nb_build_errors;
    nb_assigned_errors = base_data.nb_assigned_errors;
    update_timeout = 0
    fetch(path, data, then) {
        const xhttp = new XMLHttpRequest();
        xhttp.onreadystatechange = function() {
            if (this.readyState == 4 && this.status == 200) {
                const res = JSON.parse(this.responseText);
                then(res.result);
            }
        };
        xhttp.open("POST", path);
        xhttp.setRequestHeader('Content-Type', 'application/json');
        xhttp.send(JSON.stringify(data));
    }
    willStart() {
        this.loadSettings()
        this.updateBundles()
    }
    updateBundles() {
        clearTimeout(this.update_timeout)
        if (this.project) {
            const self = this;
            self.fetch("/runbot/data/bundles/1/" + this.project.id, {}, function(res) {
                //self.bundles.sticky.splice(0,self.bundles.sticky.length);
                self.bundles.sticky = res.bundles;
                const batch_ids = []
                res.bundles.map((bundle) => bundle.last_category_batch).forEach(
                    (di) => Object.keys(di).forEach(function(key){
                        if (self.category_custom_views[di[key]] === undefined) {
                            batch_ids.push(di[key])
                        }
                    })
                );
                if (batch_ids.length > 0) {
                    self.fetch("/runbot/data/custom_views/" + batch_ids.join(), {}, function(res) {
                        if (res) {
                            Object.keys(res).forEach((key) =>
                                self.category_custom_views[key] = res[key]
                            )
                        }
                    });
                }
            })
            this.fetch("/runbot/data/bundles/0/" + this.project.id + (this.search.value ? "/search/" + this.search.value : ''), {}, function(res) {
                self.bundles.dev = res.bundles
            }) 
        }
    }
    debounceUpdate(delay) {
        clearTimeout(this.update_timeout)
        this.update_timeout = setTimeout(this.updateBundles.bind(this), delay)
    }
    updateFilter(ev) { //todo t-model
        this.search.value = ev.target.value
        this.debounceUpdate(500)
        if (ev.keyCode === 13) {
            this.updateBundles();
        }
    }
    selectProject(project) {
        this.bundles.dev = []
        this.bundles.sticky = []
        this.project=project;
        this.updateBundles();
    }
    loadSettings() {

    }
    updateSettings() {

    }
}

async function setup() {
    // owl.config.mode = "dev";
    const app = new App();
    Component.env.options = useState({
        more: false,
    })
    app.env.qweb.addTemplate('BuildMenu', BUILD_MENU_TEMPLATE);
    app.env.qweb.addTemplate('BranchInfo', BRANCH_INFOS_TEMPLATE);
    app.mount(document.body);
}

whenReady(setup);