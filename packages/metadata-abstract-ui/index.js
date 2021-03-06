/*!
 metadata-abstract-ui v2.0.17-beta.11, built:2018-11-14
 © 2014-2018 Evgeniy Malyarov and the Oknosoft team http://www.oknosoft.ru
 metadata.js may be freely distributed under the MIT
 To obtain commercial license and technical support, contact info@oknosoft.ru
 */


'use strict';

function meta_objs() {
	const {classes} = this;
	const {CatManager, InfoRegManager, CatObj} = classes;
	class MetaObjManager extends CatManager {
	}
	class MetaFieldManager extends CatManager {
	}
	this.CatMeta_objs = class CatMeta_objs extends CatObj {
	};
	this.CatMeta_fields = class CatMeta_fields extends CatObj {
	};
	Object.assign(classes, {MetaObjManager, MetaFieldManager});
	this.cat.create('meta_objs', MetaObjManager);
	this.cat.create('meta_fields', MetaFieldManager);
}

function log_manager() {
  const {classes} = this;
  const {InfoRegManager, RegisterRow} = classes;
  class LogManager extends InfoRegManager {
    constructor(owner) {
      super(owner, 'ireg.log');
      this._stamp = Date.now();
      setInterval(this.backup.bind(this, 'stamp'), 90000);
    }
    record(msg) {
      const {wsql} = this._owner.$p;
      if(msg instanceof Error) {
        if(console) {
          console.log(msg);
        }
        msg = {
          class: 'error',
          note: msg.toString(),
        };
      }
      else if(typeof msg == 'object' && !msg.class && !msg.obj) {
        msg = {
          class: 'obj',
          obj: msg,
          note: msg.note,
        };
      }
      else if(typeof msg != 'object') {
        msg = {note: msg};
      }
      if(wsql.alasql.databases.dbo.tables.ireg_log) {
        msg.date = Date.now() + wsql.time_diff;
        if(!this._smax){
          this._smax = wsql.alasql.compile('select MAX(`sequence`) as `sequence` from `ireg_log` where `date` = ?');
        }
        const res = this._smax([msg.date]);
        if(!res.length || res[0].sequence === undefined) {
          msg.sequence = 0;
        }
        else {
          msg.sequence = parseInt(res[0].sequence) + 1;
        }
        if(!msg.class) {
          msg.class = 'note';
        }
        this.alatable.push({
          ref: msg.date + '¶' + msg.sequence,
          date: msg.date,
          sequence: msg.sequence,
          'class': msg.class,
          note: msg.note,
          obj: msg.obj || null,
        });
        this.emit_async('record', {count: this.unviewed_count()});
      }
    }
    viewed() {
      const res = [];
      const {alatable} = this;
      const log_view = $p.ireg.log_view.alatable;
      const user = $p.adapters.pouch.authorized || '';
      for(let i = alatable.length - 1; i >= 0; i--) {
        const v = alatable[i];
        log_view.some((row) => {
          if(row.key === v.ref && row.user === user) {
            v.key = row.key;
            return true;
          }
        });
        res.push(v);
      }
      return res;
    }
    unviewed_count() {
      if(!this._unviewed_count){
        this._unviewed_count = this._owner.$p.wsql.alasql.compile(
          'select value count(*) from `ireg_log` l left outer join `ireg_log_view` v on (l.ref = v.key) where v.key is null');
      }
      return this._unviewed_count();
    }
    backup(dfrom, dtill) {
      const {wsql, adapters: {pouch}, utils: {moment}} = this._owner.$p;
      if(dfrom === 'stamp' && pouch.authorized) {
        dfrom = this._stamp;
        if(!pouch.remote.log) {
          const {__opts} = (pouch.remote.ram || pouch.remote.remote || pouch.remote.doc);
          pouch.remote.log = new classes.PouchDB(__opts.name.replace(/(ram|remote|doc)$/, 'log'),
            {skip_setup: true, adapter: 'http', auth: __opts.auth});
        }
        if(!this._rows){
          this._rows = wsql.alasql.compile('select * from `ireg_log` where `date` >= ?');
        }
        const _stamp = Date.now();
        const rows = this._rows([this._stamp + wsql.time_diff]);
        for(const row of rows) {
          row._id = `${moment(row.date - wsql.time_diff).format('YYYYMMDDHHmmssSSS') + row.sequence}|${pouch.props._suffix || '0000'}|${pouch.authorized}`;
          if(typeof row.obj === 'string') {
            try{
              row.obj = JSON.parse(row.obj);
            }
            catch(e) {
            }
          }
          delete row.ref;
          delete row.user;
          delete row._deleted;
        }
        rows.length && pouch.remote.log.bulkDocs(rows)
          .then((result) => {
            this._stamp = _stamp;
          }).catch((err) => {
            console.log(err);
          });
      }
    }
    restore(dfrom, dtill) {
    }
    clear(dfrom, dtill) {
      for(const ref in this.by_ref) {
        delete this.by_ref[ref];
      }
      this.alatable.length = 0;
      const {log_view} = $p.ireg;
      for(const ref in log_view.by_ref) {
        delete log_view.by_ref[ref];
      }
      log_view.alatable.length = 0;
    }
    mark_viewed(dfrom, dtill) {
      const {alatable} = $p.ireg.log_view;
      const user = $p.adapters.pouch.authorized || '';
      if(!this._unviewed){
        this._unviewed = this._owner.$p.wsql.alasql.compile(
          'select l.ref from `ireg_log` l left outer join `ireg_log_view` v on (l.ref = v.key) where v.key is null');
      }
      for(const {ref} of this._unviewed()) {
        alatable.push({key: ref, user});
      }
    }
    get(ref, force_promise, do_not_create) {
      if(typeof ref == 'object') {
        ref = ref.ref || '';
      }
      if(!this.by_ref[ref]) {
        if(force_promise === false) {
          return undefined;
        }
        var parts = ref.split('¶');
        this._owner.$p.wsql.alasql('select * from `ireg_log` where date=' + parts[0] + ' and sequence=' + parts[1])
          .forEach(row => new RegisterRow(row, this));
      }
      return force_promise ? Promise.resolve(this.by_ref[ref]) : this.by_ref[ref];
    }
    get_sql_struct(attr) {
      if(attr && attr.action == 'get_selection') {
        var sql = 'select * from `ireg_log`';
        if(attr.date_from) {
          if(attr.date_till) {
            sql += ' where `date` >= ? and `date` <= ?';
          }
          else {
            sql += ' where `date` >= ?';
          }
        }
        else if(attr.date_till) {
          sql += ' where `date` <= ?';
        }
        return sql;
      }
      else {
        return InfoRegManager.prototype.get_sql_struct.call(this, attr);
      }
    }
  }
  this.IregLog = class IregLog extends RegisterRow {
    get date() {return this._getter('date')}
    set date(v) {this._setter('date', v);}
    get sequence() {return this._getter('sequence')}
    set sequence(v) {this._setter('sequence', v);}
    get class() {return this._getter('class')}
    set class(v) {this._setter('class', v);}
    get note() {return this._getter('note')}
    set note(v) {this._setter('note', v);}
    get obj() {return this._getter('obj')}
    set obj(v) {this._setter('obj', v);}
    get user() {return this._getter('obj')}
    set user(v) {this._setter('obj', v);}
  };
  classes.LogManager = LogManager;
  this.ireg.create('log', LogManager);
}

const DataFrame = require('dataframe');
function scheme_settings() {
  const {wsql, utils, cat, enm, dp, md, constructor} = this;
  const {CatManager, DataProcessorsManager, DataProcessorObj, CatObj, DocManager, TabularSectionRow} = constructor.classes || this;
  class SchemeSettingsManager extends CatManager {
    find_schemas(class_name) {
      if(this.cachable === 'ram') {
        return Promise.resolve(
          this.find_rows({obj: class_name}).sort((a,b) => a.user > b.user)
        );
      }
      const opt = {
        _view: 'doc/scheme_settings',
        _top: 100,
        _skip: 0,
        _key: {
          startkey: [class_name, 0],
          endkey: [class_name, 9999],
        },
      };
      const {adapter} = this;
      if(adapter.local.templates && adapter.local.templates !==  adapter.remote.doc) {
        return this.adapter.find_rows(this, opt, adapter.local.templates)
          .then((templates_data) => {
            return this.adapter.find_rows(this, opt)
              .then((data) => {
                return templates_data.concat(data);
              });
          })
      }
      else {
        return this.adapter.find_rows(this, opt);
      }
    }
    get_scheme(class_name) {
      return new Promise((resolve, reject) => {
        const scheme_name = this.scheme_name(class_name);
        const find_scheme = () => {
          this.find_schemas(class_name)
            .then((data) => {
              if(data.length == 1) {
                set_default_and_resolve(data[0]);
              }
              else if(data.length) {
                if(!$p.current_user || !$p.current_user.name) {
                  set_default_and_resolve(data[0]);
                }
                else {
                  const {name} = $p.current_user;
                  if(!data.some((scheme) => {
                      if(scheme.user == name) {
                        set_default_and_resolve(scheme);
                        return true;
                      }
                    })) {
                    set_default_and_resolve(data[0]);
                  }
                }
              }
              else {
                create_scheme();
              }
            })
            .catch((err) => {
              create_scheme();
            });
        };
        let ref = wsql.get_user_param(scheme_name, 'string');
        function set_default_and_resolve(obj) {
          resolve(obj.set_default());
        }
        function create_scheme() {
          if(!utils.is_guid(ref)) {
            ref = utils.generate_guid();
          }
          cat.scheme_settings.create({ref})
            .then((obj) => obj.fill_default(class_name).save())
            .then((obj) => set_default_and_resolve(obj));
        }
        if(ref) {
          cat.scheme_settings.get(ref, 'promise')
            .then((scheme) => {
              if(scheme && !scheme.is_new()) {
                resolve(scheme);
              }
              else {
                find_scheme();
              }
            })
            .catch((err) => {
              find_scheme();
            });
        }
        else {
          find_scheme();
        }
      });
    }
    scheme_name(class_name) {
      return 'scheme_settings_' + class_name.replace(/\./g, '_');
    }
  }
  class SchemeSelectManager extends DataProcessorsManager {
    dp(scheme) {
      const _obj = dp.scheme_settings.create();
      _obj.scheme = scheme;
      const _meta = Object.assign({}, this.metadata('scheme'));
      _meta.choice_params = [{
        name: 'obj',
        path: scheme.obj,
      }];
      return {_obj, _meta};
    }
  }
  class DpScheme_settings extends DataProcessorObj {
    get scheme() {
      return this._getter('scheme');
    }
    set scheme(v) {
      this._setter('scheme', v);
    }
  }  this.DpScheme_settings = DpScheme_settings;
  class CatScheme_settings extends CatObj {
    constructor(attr, manager, loading) {
      super(attr, manager, loading);
      this.set_standard_period();
    }
    load() {
      return super.load()
        .then(() => {
          const {_data, _manager: {adapter}} = this;
          if(this.is_new() && adapter.local.templates && adapter.local.templates !== adapter.remote.doc) {
            _data._loading = true;
            return adapter.load_obj(this, {db: adapter.local.templates})
              .then(() => {
                _data._loading = false;
                _data._modified = false;
                return this.after_load();
              });
          }
          return this;
        })
    }
    set_standard_period() {
      const {standard_period} = enm;
      const from = utils.moment();
      const till = from.clone();
      switch (this.standard_period) {
        case standard_period.yesterday:
          this.date_from = from.subtract(1, 'days').startOf('day').toDate();
          this.date_till = till.subtract(1, 'days').endOf('day').toDate();
          break;
        case standard_period.today:
          this.date_from = from.startOf('day').toDate();
          this.date_till = till.endOf('day').toDate();
          break;
        case standard_period.tomorrow:
          this.date_from = from.add(1, 'days').startOf('day').toDate();
          this.date_till = till.add(1, 'days').endOf('day').toDate();
          break;
        case standard_period.last7days:
          this.date_from = from.subtract(7, 'days').startOf('day').toDate();
          this.date_till = till.endOf('day').toDate();
          break;
        case standard_period.lastTendays:
          const nf = from.clone();
          (nf.date() > 10) ? nf.subtract(10, 'days') : nf.subtract(1, 'month').endOf('month');
          const days_of_ten = 10 * Math.floor(nf.date() / 10);
          this.date_from = from.startOf('month').add(days_of_ten, 'days').toDate();
          const ed = from.clone();
          ed.add(9, 'days');
          this.date_till = (ed.month() > nf.month()) ? nf.endOf('month').toDate() : ed.endOf('day').toDate();
          break;
        case standard_period.last30days:
          this.date_from = from.subtract(30, 'days').startOf('day').toDate();
          this.date_till = till.endOf('day').toDate();
          break;
        case standard_period.last3Month:
          this.date_from = from.subtract(2, 'month').startOf('month').toDate();
          this.date_till = till.endOf('month').toDate();
          break;
        case standard_period.lastWeek:
          this.date_from = from.subtract(1, 'weeks').startOf('week').toDate();
          this.date_till = till.subtract(1, 'weeks').endOf('week').toDate();
          break;
        case standard_period.lastMonth:
          this.date_from = from.subtract(1, 'month').startOf('month').toDate();
          this.date_till = till.subtract(1, 'month').endOf('month').toDate();
          break;
        case standard_period.lastQuarter:
          this.date_from = from.subtract(1, 'quarters').startOf('quarter').toDate();
          this.date_till = till.subtract(1, 'quarters').endOf('quarter').toDate();
          break;
        case standard_period.lastHalfYear:
          this.date_from = (from.quarter() >= 3) ? from.startOf('year').toDate() : from.subtract(from.quarter() + 1, 'quarters').startOf('quarter').toDate();
          this.date_till = from.add(180, 'days').endOf('quarter').toDate();
          break;
        case standard_period.lastYear:
          this.date_from = from.subtract(1, 'years').startOf('year').toDate();
          this.date_till = till.subtract(1, 'years').endOf('year').toDate();
          break;
        case standard_period.next7Days:
          this.date_from = from.add(1, 'days').startOf('day').toDate();
          this.date_till = till.add(7, 'days').endOf('day').toDate();
          break;
        case standard_period.nextTendays:
          const dot = 10 * Math.floor(from.date() / 10) + 10;
          const nf2 = from.clone().startOf('month').add(dot, 'days');
          this.date_from = (nf2.month() > from.month()) ? nf2.startOf('month').toDate() : nf2.startOf('day').toDate();
          const ed2 = nf2.clone();
          ed2.add(9, 'days');
          this.date_till = (ed2.month() > nf2.month()) ? nf2.endOf('month').toDate() : ed2.endOf('day').toDate();
          break;
        case standard_period.nextWeek:
          this.date_from = from.add(1, 'weeks').startOf('week').toDate();
          this.date_till = till.add(1, 'weeks').endOf('week').toDate();
          break;
        case standard_period.nextMonth:
          this.date_from = from.add(1, 'months').startOf('month').toDate();
          this.date_till = till.add(1, 'months').endOf('month').toDate();
          break;
        case standard_period.nextQuarter:
          this.date_from = from.add(1, 'quarters').startOf('quarter').toDate();
          this.date_till = till.add(1, 'quarters').endOf('quarter').toDate();
          break;
        case standard_period.nextHalfYear:
          this.date_from = (from.quarter() <= 2) ? from.startOf('year').add(7, 'month').startOf('quarter').toDate() : from.add(1, 'year').startOf('year').toDate();
          this.date_till = (till.quarter() <= 2) ? till.startOf('year').add(7, 'month').endOf('year').toDate() : till.add(1, 'year').startOf('year').add(5, 'month').endOf('quarter').toDate();
          break;
        case standard_period.nextYear:
          this.date_from = from.add(1, 'years').startOf('year').toDate();
          this.date_till = till.add(1, 'years').endOf('year').toDate();
          break;
        case standard_period.tillEndOfThisYear:
          this.date_from = from.startOf('day').toDate();
          this.date_till = till.endOf('year').toDate();
          break;
        case standard_period.tillEndOfThisQuarter:
          this.date_from = from.startOf('day').toDate();
          this.date_till = till.endOf('quarter').toDate();
          break;
        case standard_period.tillEndOfThisMonth:
          this.date_from = from.startOf('day').toDate();
          this.date_till = till.endOf('month').toDate();
          break;
        case standard_period.tillEndOfThisHalfYear:
          this.date_from = from.startOf('day').toDate();
          this.date_till = (from.quarter() <= 2) ? from.startOf('year').add(5, 'month').endOf('quarter').toDate() : from.endOf('year').toDate();
          break;
        case standard_period.tillEndOfThistendays:
          this.date_from = from.startOf('day').toDate();
          const dot2 = 10 * Math.floor(from.date() / 10) + 9;
          const this_end_days = from.clone().startOf('month').add(dot2, 'days');
          this.date_till = (this_end_days.month() > from.date()) ? from.endOf('month').toDate() : this_end_days.endOf('day').toDate();
          break;
        case standard_period.tillEndOfThisweek:
          this.date_from = from.startOf('day').toDate();
          this.date_till = till.endOf('week').toDate();
          break;
        case standard_period.fromBeginningOfThisYear:
          this.date_from = from.startOf('year').toDate();
          this.date_till = till.endOf('day').toDate();
          break;
        case standard_period.fromBeginningOfThisQuarter:
          this.date_from = from.startOf('quarter').toDate();
          this.date_till = till.endOf('day').toDate();
          break;
        case standard_period.fromBeginningOfThisMonth:
          this.date_from = from.startOf('month').toDate();
          this.date_till = till.endOf('day').toDate();
          break;
        case standard_period.fromBeginningOfThisHalfYear:
          this.date_from = (from.quarter() <= 2) ? from.startOf('year').toDate : from.startOf('year').add(7, 'month').startOf('quarter').toDate();
          this.date_till = till.endOf('day').toDate();
          break;
        case standard_period.fromBeginningOfThisTendays:
          const dot4 = 10 * Math.floor(from.date() / 10);
          this.date_from = from.startOf('month').add(dot4, 'days').toDate();
          this.date_till = till.endOf('day').toDate();
          break;
        case standard_period.fromBeginningOfThisWeek:
          this.date_from = from.startOf('week').toDate();
          this.date_till = till.endOf('day').toDate();
          break;
        case standard_period.thisTenDays:
          const dot5 = 10 * Math.floor(from.date() / 10);
          this.date_from = from.startOf('month').add(dot5, 'days').toDate();
          const dot6 = 10 * Math.floor(from.date() / 10) + 9;
          const this_end_days2 = from.clone().startOf('month').add(dot6, 'days');
          this.date_till = (this_end_days2.month() > from.date()) ? from.endOf('month').toDate() : this_end_days2.endOf('day').toDate();
          break;
        case standard_period.thisWeek:
          this.date_from = from.startOf('week').toDate();
          this.date_till = till.endOf('week').toDate();
          break;
        case standard_period.thisHalfYear:
          this.date_from = (from.quarter() <= 2) ? from.startOf('year').toDate : from.startOf('year').add(7, 'month').startOf('quarter').toDate();
          this.date_till = (from.quarter() <= 2) ? from.startOf('year').add(5, 'month').endOf('quarter').toDate() : from.endOf('year').toDate();
          break;
        case standard_period.thisYear:
          this.date_from = from.startOf('year').toDate();
          this.date_till = till.endOf('year').toDate();
          break;
        case standard_period.thisQuarter:
          this.date_from = from.startOf('quarter').toDate();
          this.date_till = till.endOf('quarter').toDate();
          break;
        case standard_period.thisMonth:
          this.date_from = from.startOf('month').toDate();
          this.date_till = till.endOf('month').toDate();
          break;
      }
    }
    get obj() {
      return this._getter('obj');
    }
    set obj(v) {
      this._setter('obj', v);
    }
    get user() {
      return this._getter('user');
    }
    set user(v) {
      this._setter('user', v);
    }
    get order() {
      return this._getter('order');
    }
    set order(v) {
      this._setter('order', v);
    }
    get formula() {
      return this._getter('formula');
    }
    set formula(v) {
      this._setter('formula', v);
    }
    get query() {
      return this._getter('query');
    }
    set query(v) {
      this._setter('query', v);
    }
    get tag() {
      return this._getter('tag');
    }
    set tag(v) {
      this._setter('tag', v);
    }
    get date_from() {
      return this._getter('date_from');
    }
    set date_from(v) {
      this._setter('date_from', v);
    }
    get date_till() {
      return this._getter('date_till');
    }
    set date_till(v) {
      this._setter('date_till', v);
    }
    get standard_period() {
      return this._getter('standard_period');
    }
    set standard_period(v) {
      this._setter('standard_period', v);
      !this._data._loading && this.set_standard_period();
    }
    get fields() {
      return this._getter_ts('fields');
    }
    set fields(v) {
      this._setter_ts('fields', v);
    }
    get sorting() {
      return this._getter_ts('sorting');
    }
    set sorting(v) {
      this._setter_ts('sorting', v);
    }
    get dimensions() {
      return this._getter_ts('dimensions');
    }
    set dimensions(v) {
      this._setter_ts('dimensions', v);
    }
    get resources() {
      return this._getter_ts('resources');
    }
    set resources(v) {
      this._setter_ts('resources', v);
    }
    get selection() {
      return this._getter_ts('selection');
    }
    set selection(v) {
      this._setter_ts('selection', v);
    }
    get params() {
      return this._getter_ts('params');
    }
    set params(v) {
      this._setter_ts('params', v);
    }
    get composition() {
      return this._getter_ts('composition');
    }
    set composition(v) {
      this._setter_ts('composition', v);
    }
    get conditional_appearance() {
      return this._getter_ts('conditional_appearance');
    }
    set conditional_appearance(v) {
      this._setter_ts('conditional_appearance', v);
    }
    fill_default(class_name) {
      const {parts, _mgr, _meta} = this.child_meta(class_name);
      const columns = [];
      function add_column(fld, use) {
        const id = fld.id || fld;
        const fld_meta = _meta.fields[id] || _mgr.metadata(id);
        fld_meta && columns.push({
          field: id,
          caption: fld.caption || fld_meta.synonym,
          tooltip: fld_meta.tooltip,
          width: fld.width || fld_meta.width,
          use: use,
        });
      }
      if(parts.length < 3) {
        if(_meta.form && _meta.form.selection) {
          _meta.form.selection.cols.forEach(fld => {
            add_column(fld, true);
          });
        }
        else {
          if(_mgr instanceof CatManager) {
            if(_meta.code_length) {
              columns.push('id');
            }
            if(_meta.main_presentation_name) {
              columns.push('name');
            }
          }
          else if(_mgr instanceof DocManager) {
            columns.push('number_doc');
            columns.push('date');
          }
          columns.forEach((id) => {
            add_column(id, true);
          });
        }
      }
      else {
        for (var field in _meta.fields) {
          add_column(field, true);
        }
      }
      for (var field in _meta.fields) {
        if(!columns.some(function (column) {
            return column.field == field;
          })) {
          add_column(field, false);
        }
      }
      columns.forEach((column) => {
        this.fields.add(column);
      });
      const {resources} = _mgr.obj_constructor('', true).prototype;
      resources && resources.forEach((field) => this.resources.add({field}));
      this.obj = class_name;
      if(!this.name) {
        this.name = 'Основная';
        this.date_from = new Date((new Date()).getFullYear().toFixed() + '-01-01');
        this.date_till = utils.date_add_day(new Date(), 1);
      }
      if(!this.user) {
        this.user = $p.current_user.name;
      }
      return this;
    }
    child_meta(class_name) {
      if(!class_name) {
        class_name = this.obj;
      }
      const parts = class_name.split('.'),
        _mgr = md.mgr_by_class_name(class_name),
        _meta = parts.length < 3 ? _mgr.metadata() : _mgr.metadata(parts[2]);
      if(parts.length < 3 && !_meta.fields._deleted) {
        const {fields} = _meta;
        fields._deleted = _mgr.metadata('_deleted');
        if(_mgr instanceof DocManager && !fields.date) {
          fields.posted = _mgr.metadata('posted');
          fields.date = _mgr.metadata('date');
          fields.number_doc = _mgr.metadata('number_doc');
        }
        if(_mgr instanceof CatManager && !fields.name && !fields.id) {
          if(_meta.code_length) {
            fields.id = _mgr.metadata('id');
          }
          if(_meta.has_owners) {
            fields.owner = _mgr.metadata('owner');
          }
          fields.name = _mgr.metadata('name');
        }
      }
      if(parts.length > 2 && !_meta.fields.ref) {
        _meta.fields.ref = _mgr.metadata('ref');
      }
      return {parts, _mgr, _meta};
    }
    set_default() {
      wsql.set_user_param(this._manager.scheme_name(this.obj), this.ref);
      return this;
    }
    mango_selector({columns, skip, limit}) {
      function format(date) {
        return utils.moment(date).format('YYYY-MM-DD');
      }
      const res = {
        selector: {
          $and: [
            {class_name: {$eq: this.obj}}
          ]
        },
        fields: ['_id', 'posted'],
      };
      for (const column of (columns || this.columns())) {
        if(res.fields.indexOf(column.id) == -1) {
          res.fields.push(column.id);
        }
      }
      if(this.standard_period.empty()) {
        this._search && res.selector.$and.push({search: {$regex: this._search}});
      }
      else {
        res.selector.$and.push({date: {$gte: format(this.date_from)}});
        res.selector.$and.push({date: {$lte: format(this.date_till) + '\ufff0'}});
        res.selector.$and.push({search: this._search ? {$regex: this._search} : {$gt: null}});
        res.use_index = ['mango', 'search'];
      }
      this.sorting.find_rows({use: true, field: 'date'}, (row) => {
        let direction = row.direction.valueOf();
        if(!direction || direction == '_') {
          direction = 'asc';
        }
        res.sort = [{class_name: direction}, {date: direction}];
      });
      if(skip) {
        res.skip = skip;
      }
      if(limit) {
        res.limit = limit;
      }
      Object.defineProperty(res, '_mango', {value: true});
      return res;
    }
    append_selection(selector) {
      if(!selector.$and) {
        selector.$and = [];
      }
      this.selection.find_rows({use: true}, ({left_value, left_value_type, right_value, right_value_type, comparison_type}) => {
        if(left_value_type === 'path'){
          if(right_value_type === 'boolean') {
            const val = Boolean(right_value);
            selector.$and.push({[left_value]: comparison_type == 'ne' ? {$ne: val} : val});
          }
          else if(right_value_type === 'calculated') {
            const val = $p.current_user && $p.current_user[right_value];
            selector.$and.push({[left_value]: comparison_type == 'ne' ? {$ne: val} : val});
          }
          else if(right_value_type.includes('.') && (comparison_type == 'filled' || comparison_type == 'nfilled')){
            selector.$and.push({[left_value]: {[comparison_type.valueOf()]: true}});
          }
          else if(right_value_type === 'number' && (comparison_type == 'filled' || comparison_type == 'nfilled')){
            selector.$and.push({[left_value]: {[comparison_type.valueOf()]: 0}});
          }
        }
      });
    }
    filter(collection, parent = '', self = false) {
      const selection = [];
      this.selection.find_rows({use: true}, (row) => selection.push(row));
      const res = [];
      const {utils, md, enm: {comparison_types}} = $p;
      collection.forEach((row) => {
        let ok = true;
        for(let {left_value, left_value_type, right_value, right_value_type, comparison_type} of selection){
          if(left_value_type === 'path'){
            const path = left_value.split('.');
            left_value = row[path[0]];
            for(let i = 1; i < path.length; i++){
              left_value = left_value[path[i]];
            }
          }
          else if(left_value_type && left_value_type !== 'string'){
            const mgr = md.mgr_by_class_name(left_value_type);
            left_value = mgr ? mgr.get(left_value) : utils.fetch_type(left_value, {types: [left_value_type]});
          }
          if(right_value_type === 'path'){
            const path = right_value.split('.');
            right_value = row[path[0]];
            for(let i = 1; i < path.length; i++){
              right_value = right_value[path[i]];
            }
          }
          else if(right_value_type && right_value_type !== 'string'){
            const mgr = md.mgr_by_class_name(right_value_type);
            right_value = mgr ? mgr.get(right_value) : utils.fetch_type(right_value, {types: [right_value_type]});
          }
          ok = utils.check_compare(left_value, right_value, comparison_type, comparison_types);
          if(!ok){
            break;
          }
        }
        if(self){
          !ok && res.push(row._obj);
        }
        else{
          ok && res.push(row);
        }
      });
      if(self){
        const {_obj} = collection;
        res.forEach((row) => {
          _obj.splice(_obj.indexOf(row), 1);
        });
        _obj.forEach((row, index) => row.row = index + 1);
        return collection;
      }
      else{
        return res;
      }
    }
    group_by(collection) {
      const grouping = this.dims();
      const dims = this.dims();
      const ress = [];
      const resources = this.resources._obj.map(v => v.field);
      const {_manager} = collection._owner;
      const meta = _manager.metadata(_manager._tabular || 'data').fields;
      const _columns = this.rx_columns({_obj: this, mode: 'ts', fields: meta});
      _columns.forEach(({key}) => {
        if(dims.indexOf(key) == -1 && resources.indexOf(key) != -1) {
          ress.push(key);
        }
        else {
          dims.indexOf(key) == -1 && dims.push(key);
        }
      });
      if(grouping.length) {
        const dflds = dims.filter(v => v);
        const reduce = function(row, memo) {
          for(const resource of ress){
            memo[resource] = (memo[resource] || 0) + row[resource];
          }
          return memo;
        };
        const df = DataFrame({
          rows: collection._obj,
          dimensions: dflds.map(v => ({value: v, title: v})),
          reduce
        });
        const res = df.calculate({
          dimensions: dflds,
          sortBy: '',
          sortDir: 'asc',
        });
        const stack = [];
        const col0 = _columns[0];
        const {is_data_obj, is_data_mgr, moment} = $p.utils;
        let prevLevel;
        let index = 0;
        const cast_field = function (row, gdim, force) {
          const mgr = _manager.value_mgr(row, gdim, meta[gdim].type);
          const val = is_data_mgr(mgr) ? mgr.get(row[gdim]) : row[gdim];
          if(_columns.some(v => v.key === gdim)){
            row[gdim] = val;
          }
          else if(force){
            row[col0.key] = _manager.value_mgr(row, col0.key, meta[col0.key].type) ?
              is_data_obj(val) ? val : {presentation: val instanceof Date ? moment(val).format(moment._masks[meta[gdim].type.date_part]) : val }
              :
              is_data_obj(val) ? val.toString() : val;
          }
        };
        const totals = !grouping[0];
        if(totals){
          grouping.splice(0, 1);
          const row = {
            row: (index++).toString(),
            children: [],
          };
          collection._rows.push(row);
          stack.push(row);
          row[col0.key] = col0._meta.type.is_ref ? {presentation: 'Σ'} : 'Σ';
        }
        else{
          stack.push({children: collection._rows});
        }
        for(const row of res) {
          const level = stack.length - 1;
          const parent = stack[level];
          if(!prevLevel) {
            prevLevel = level;
          }
          let lvl = row._level + 1;
          if(lvl > grouping.length && lvl < dflds.length) {
            prevLevel = lvl;
            continue;
          }
          row.row = (index++).toString();
          if(lvl > level && lvl < dflds.length){
            parent.children.push(row);
            row.children = [];
            stack.push(row);
            cast_field(row, grouping[stack.length - 2], true);
          }
          else if(lvl < prevLevel) {
            stack.pop();
            stack[stack.length - 1].children.push(row);
            row.children = [];
            stack.push(row);
            cast_field(row, grouping[stack.length - 2], true);
          }
          else {
            parent.children.push(row);
            for(const gdim of dflds){
              cast_field(row, gdim);
            }
          }
          prevLevel = lvl;
        }
        collection._rows._count = index;
        if(totals){
          const row = collection._rows[0];
          row.children.reduce((memo, row) => reduce(row, memo), row);
        }
      }
      else {
        collection.group_by(dims, ress);
        collection.forEach((row) => {
          collection._rows.push(row);
        });
        collection._rows._count = collection._rows.length;
      }
    }
    columns(mode) {
      const parts = this.obj.split('.'),
        _mgr = md.mgr_by_class_name(this.obj),
        _meta = parts.length < 3 ? _mgr.metadata() : _mgr.metadata(parts[2]),
        res = [];
      this.fields.find_rows({use: true}, (row) => {
        const fld_meta = _meta.fields[row.field] || _mgr.metadata(row.field);
        let column;
        if(mode == 'ts') {
          column = {
            key: row.field,
            name: row.caption,
            resizable: true,
            ctrl_type: row.ctrl_type,
            width: row.width == '*' ? 250 : (parseInt(row.width) || 140),
          };
        }
        else {
          column = {
            id: row.field,
            synonym: row.caption,
            tooltip: row.tooltip,
            type: fld_meta.type,
            ctrl_type: row.ctrl_type,
            width: row.width == '*' ? 250 : (parseInt(row.width) || 140),
          };
        }
        res.push(column);
      });
      return res;
    }
    used(collection, parent) {
      const res = [];
      collection.find_rows({use: true}, ({field}) => res.push(field));
      return res;
    }
    dims(parent) {
      const res = [];
      for (const dims of this.used(this.dimensions, parent)) {
        for (const key of dims.split(',').map(v => v.trim())) {
          res.indexOf(key) == -1 && res.push(key);
        }
      }
      return res;
    }
    used_fields(parent) {
      return this.used(this.fields, parent);
    }
    used_fields_list() {
      return this.fields._obj.map(({field, caption}) => ({
        id: field,
        value: field,
        text: caption,
        title: caption,
      }));
    }
  }  this.CatScheme_settings = CatScheme_settings;
  this.CatScheme_settingsDimensionsRow = class CatScheme_settingsDimensionsRow extends TabularSectionRow {
    get parent() {
      return this._getter('parent');
    }
    set parent(v) {
      this._setter('parent', v);
    }
    get use() {
      return this._getter('use');
    }
    set use(v) {
      this._setter('use', v);
    }
    get field() {
      return this._getter('field');
    }
    set field(v) {
      this._setter('field', v);
    }
  };
  this.CatScheme_settingsResourcesRow = class CatScheme_settingsResourcesRow extends this.CatScheme_settingsDimensionsRow {
    get use() {
      return true;
    }
    set use(v) {
    }
    get formula() {
      return this._getter('formula');
    }
    set formula(v) {
      this._setter('formula', v);
    }
  };
  this.CatScheme_settingsFieldsRow = class CatScheme_settingsFieldsRow extends this.CatScheme_settingsDimensionsRow {
    get width() {
      return this._getter('width');
    }
    set width(v) {
      this._setter('width', v);
    }
    get caption() {
      return this._getter('caption');
    }
    set caption(v) {
      this._setter('caption', v);
    }
    get tooltip() {
      return this._getter('tooltip');
    }
    set tooltip(v) {
      this._setter('tooltip', v);
    }
    get ctrl_type() {
      return this._getter('ctrl_type');
    }
    set ctrl_type(v) {
      this._setter('ctrl_type', v);
    }
    get formatter() {
      return this._getter('formatter');
    }
    set formatter(v) {
      this._setter('formatter', v);
    }
    get editor() {
      return this._getter('editor');
    }
    set editor(v) {
      this._setter('editor', v);
    }
  };
  this.CatScheme_settingsSortingRow = class CatScheme_settingsSortingRow extends this.CatScheme_settingsDimensionsRow {
    get direction() {
      return this._getter('direction');
    }
    set direction(v) {
      this._setter('direction', v);
    }
  };
  this.CatScheme_settingsSelectionRow = class CatScheme_settingsSelectionRow extends TabularSectionRow {
    get parent() {
      return this._getter('parent');
    }
    set parent(v) {
      this._setter('parent', v);
    }
    get use() {
      return this._getter('use');
    }
    set use(v) {
      this._setter('use', v);
    }
    get left_value() {
      return this._getter('left_value');
    }
    set left_value(v) {
      this._setter('left_value', v);
    }
    get left_value_type() {
      return this._getter('left_value_type');
    }
    set left_value_type(v) {
      this._setter('left_value_type', v);
    }
    get comparison_type() {
      return this._getter('comparison_type');
    }
    set comparison_type(v) {
      this._setter('comparison_type', v);
    }
    get right_value() {
      return this._getter('right_value');
    }
    set right_value(v) {
      this._setter('right_value', v);
    }
    get right_value_type() {
      return this._getter('right_value_type');
    }
    set right_value_type(v) {
      this._setter('right_value_type', v);
    }
  };
  this.CatScheme_settingsParamsRow = class CatScheme_settingsParamsRow extends TabularSectionRow {
    get param() {
      return this._getter('param');
    }
    set param(v) {
      this._setter('param', v);
    }
    get value() {
      return this._getter('value');
    }
    set value(v) {
      this._setter('value', v);
    }
    get value_type() {
      return this._getter('value_type');
    }
    set value_type(v) {
      this._setter('value_type', v);
    }
    get quick_access() {
      return this._getter('quick_access');
    }
    set quick_access(v) {
      this._setter('quick_access', v);
    }
    get output() {
      return this._getter('output');
    }
    set output(v) {
      this._setter('output', v);
    }
  };
  this.CatScheme_settingsCompositionRow = class CatScheme_settingsCompositionRow extends this.CatScheme_settingsDimensionsRow {
    get kind() {
      return this._getter('kind');
    }
    set kind(v) {
      this._setter('kind', v);
    }
    get definition() {
      return this._getter('definition');
    }
    set definition(v) {
      this._setter('definition', v);
    }
  };
  cat.create('scheme_settings', SchemeSettingsManager);
  dp.create('scheme_settings', SchemeSelectManager);
}

function mngrs() {
  const {classes, msg} = this;
  Object.defineProperties(classes.DataManager.prototype, {
    family_name: {
      get () {
        return msg.meta_mgrs[this.class_name.split('.')[0]].replace(msg.meta_mgrs.mgr + ' ', '');
      }
    },
    frm_selection_name: {
      get () {
        const meta = this.metadata();
        return `${msg.open_frm} ${msg.selection_parent} ${msg.meta_parents[this.class_name.split('.')[0]]} '${meta.synonym || meta.name}'`;
      }
    },
    frm_obj_name: {
      get () {
        const meta = this.metadata();
        return `${msg.open_frm} ${msg.obj_parent} ${msg.meta_parents[this.class_name.split('.')[0]]} '${meta.synonym || meta.name}'`;
      }
    }
  });
}

class YaGeocoder {
  geocode(attr) {
    return Promise.resolve(false);
  }
}
function ipinfo() {
  const {classes, md, msg, record_log, utils, job_prm} = this;
  class IPInfo{
    constructor() {
      this._yageocoder = null;
      this._ggeocoder = null;
      this._parts = null;
      this._addr = '';
      this._pos = 0;
      if (job_prm.use_google_geo && typeof window !== 'undefined') {
        if (!window.google || !window.google.maps) {
          utils.load_script(`https://maps.google.com/maps/api/js?key=${job_prm.use_google_geo}&callback=$p.ipinfo.location_callback`, 'script');
        }
        else {
          this.location_callback();
        }
      }
    }
    ipgeo() {
      return fetch('//api.sypexgeo.net/')
        .then(response => response.json())
        .catch(record_log);
    }
    get yageocoder() {
      if(!this._yageocoder){
        this._yageocoder = new YaGeocoder();
      }
      return _yageocoder;
    }
    get ggeocoder(){
      return this._ggeocoder;
    }
    get addr() {
      return this._addr;
    }
    get parts() {
      return this._parts;
    }
    components(v, components) {
      if(!v) v = {};
      if(!components) components = this._parts.address_components;
      let i, c, j, street = "", street0 = "", locality = "";
      for(i in components){
        c = components[i];
        for(j in c.types){
          switch(c.types[j]){
          case "route":
            if(c.short_name.indexOf("Unnamed")==-1){
              street = c.short_name + (street ? (" " + street) : "");
              street0 = c.long_name.replace("улица", "").trim();
            }
            break;
          case "administrative_area_level_1":
            v.region = c.long_name;
            break;
          case "administrative_area_level_2":
            v.city = c.short_name;
            v.city_long = c.long_name;
            break;
          case "locality":
            v.locality = c.short_name;
            locality = (locality ? (locality + " ") : "") + c.short_name;
            break;
          case "street_number":
            v.house = "дом " + c.short_name;
            break;
          case "postal_code":
            v.postal_code = c.short_name;
            break;
          default:
            break;
          }
        }
      }
      if(v.region && v.region == v.city_long)
        if(v.city.indexOf(locality) == -1)
          v.city = locality;
        else
          v.city = "";
      else if(locality){
        if(v.city.indexOf(locality) == -1 && v.region.indexOf(locality) == -1)
          street = locality + ", " + street;
      }
      if(!v.street || v.street.indexOf(street0)==-1)
        v.street = street;
      return v;
    }
    location_callback() {
      this._ggeocoder = new google.maps.Geocoder();
      md.emit('geo_google_ready');
      this.crrent_pos_ready();
    }
    crrent_pos_ready() {
      return new Promise((resolve, reject) => {
        if(this._pos === 2) {
          resolve();
        }
        else if(this._pos === 1) {
          const timer = setTimeout(() => {
            if(this._pos === 2) {
              resolve();
            }
            else {
              reject();
            }
          }, 10000);
          md.once('geo_current_position', () => {
            clearTimeout(timer);
            resolve();
          });
        }
        else {
          if(!navigator.geolocation){
            return reject();
          }
          this._pos = 1;
          navigator.geolocation.getCurrentPosition(
            (position) => {
              this.latitude = position.coords.latitude;
              this.longitude = position.coords.longitude;
              const latlng = new google.maps.LatLng(this.latitude, this.longitude);
              this._ggeocoder.geocode({'latLng': latlng}, (results, status) => {
                if (status == google.maps.GeocoderStatus.OK){
                  this._pos = 2;
                  if(!results[1] || results[0].address_components.length >= results[1].address_components.length) {
                    this._parts = results[0];
                  }
                  else {
                    this._parts = results[1];
                  }
                  this._addr = this._parts.formatted_address;
                  md.emit('geo_current_position', this.components());
                }
              });
            },
            (err) => {
              reject(err);
            },
            {
              enableHighAccuracy: true,
              maximumAge: 300000,
              timeout: 20000,
            }
          );
        }
      });
    }
    google_ready() {
      return new Promise((resolve, reject) => {
        if(this._ggeocoder) {
          return resolve();
        }
        setTimeout(() => {
          if(this._ggeocoder){
            return resolve();
          }
          msg.show_msg({
            type: "alert-warning",
            text: msg.error_geocoding + " Google",
            title: msg.main_title
          });
          reject();
        }, 10000);
      });
    }
  }
	classes.IPInfo = IPInfo;
}

function checker() {
  const {utils, job_prm, md} = this;
  const checker = utils.single_instance_checker = {
    init() {
      if(typeof window === 'undefined') {
        return;
      }
      window.addEventListener('storage', this.storageChanged);
      const prefix = job_prm.local_storage_prefix;
      this.LocalStorageKeyName = prefix + 'instanceCheck';
      this.LocalStorageResponseKeyName = prefix + 'instanceMaster';
      this.instanceKey = prefix + Date.now().toString();
      this.setKey(this.LocalStorageKeyName, this.instanceKey);
      this.emit = function (type) {
        md.emit(type);
      };
    },
    storageChanged(e) {
      if(!e.newValue) {
        return;
      }
      const {LocalStorageKeyName, LocalStorageResponseKeyName, instanceKey} = checker;
      if(e.key === LocalStorageKeyName && e.newValue !== instanceKey) {
        checker.setKey(LocalStorageResponseKeyName, instanceKey + Math.random().toString());
      }
      else if(e.key === LocalStorageResponseKeyName && e.newValue.indexOf(instanceKey) < 0) {
        window.removeEventListener('storage', checker.storageChanged);
        job_prm.second_instance = true;
        checker.emit('second_instance');
      }
    },
    setKey(key, value) {
      try {
        localStorage.setItem(key, value);
        setTimeout(() => {
          localStorage.removeItem(key);
        }, 100);
      } catch (e) {
      }
    }
  };
}

var plugin = {
  constructor() {
    meta_objs.call(this);
    log_manager.call(this);
    scheme_settings.call(this);
    mngrs.call(this);
    ipinfo.call(this);
    checker.call(this);
  }
};

module.exports = plugin;
//# sourceMappingURL=index.js.map
