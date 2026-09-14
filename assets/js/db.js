(function () {
  "use strict";

  var DB_NAME = "registration-table";
  var DB_VERSION = 2;
  var COLUMN_STORE = "columns";
  var ROW_STORE = "rows";
  var META_STORE = "meta";
  var LEGACY_STORE = "records";
  var dbPromise = null;

  var DEFAULT_COLUMNS = [
    { id: "col-name", name: "姓名" },
    { id: "col-phone", name: "手机号" },
    { id: "col-email", name: "邮箱" },
    { id: "col-department", name: "部门" },
    { id: "col-status", name: "状态" },
    { id: "col-note", name: "备注" }
  ];

  function supportsIndexedDB() {
    return typeof window !== "undefined" && "indexedDB" in window && window.indexedDB !== null;
  }

  function createId(prefix) {
    return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function now() {
    return new Date().toISOString();
  }

  function openDatabase() {
    if (!supportsIndexedDB()) {
      return Promise.reject(new Error("当前浏览器不支持 IndexedDB。"));
    }

    if (dbPromise) {
      return dbPromise;
    }

    dbPromise = new Promise(function (resolve, reject) {
      var request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = function (event) {
        var db = request.result;
        var transaction = request.transaction;
        var columnsStore;
        var rowsStore;
        var metaStore;

        if (!db.objectStoreNames.contains(COLUMN_STORE)) {
          columnsStore = db.createObjectStore(COLUMN_STORE, { keyPath: "id" });
          columnsStore.createIndex("position", "position", { unique: false });
        } else {
          columnsStore = transaction.objectStore(COLUMN_STORE);
        }

        if (!db.objectStoreNames.contains(ROW_STORE)) {
          rowsStore = db.createObjectStore(ROW_STORE, { keyPath: "id", autoIncrement: true });
          rowsStore.createIndex("updatedAt", "updatedAt", { unique: false });
        } else {
          rowsStore = transaction.objectStore(ROW_STORE);
        }

        if (!db.objectStoreNames.contains(META_STORE)) {
          metaStore = db.createObjectStore(META_STORE, { keyPath: "key" });
        } else {
          metaStore = transaction.objectStore(META_STORE);
        }

        if (event.oldVersion < 2 && db.objectStoreNames.contains(LEGACY_STORE)) {
          migrateLegacyRecords(transaction, columnsStore, rowsStore, metaStore);
        }
      };

      request.onsuccess = function () {
        resolve(request.result);
      };

      request.onerror = function () {
        dbPromise = null;
        reject(request.error || new Error("无法打开本地数据库。"));
      };

      request.onblocked = function () {
        dbPromise = null;
        reject(new Error("数据库升级被其他页面阻塞，请关闭该应用的其它标签页后重试。"));
      };
    });

    return dbPromise;
  }

  function migrateLegacyRecords(transaction, columnsStore, rowsStore, metaStore) {
    var legacyRequest = transaction.objectStore(LEGACY_STORE).getAll();

    legacyRequest.onsuccess = function () {
      var legacyRecords = legacyRequest.result || [];
      var timestamp;
      var mappedColumns;

      if (legacyRecords.length === 0) {
        return;
      }

      timestamp = now();
      mappedColumns = [
        { id: "col-name", name: "姓名", key: "name" },
        { id: "col-phone", name: "手机号", key: "phone" },
        { id: "col-email", name: "邮箱", key: "email" },
        { id: "col-department", name: "部门", key: "department" },
        { id: "col-status", name: "状态", key: "status" },
        { id: "col-note", name: "备注", key: "note" }
      ];

      mappedColumns.forEach(function (column, index) {
        columnsStore.put({
          id: column.id,
          name: column.name,
          position: index,
          createdAt: timestamp,
          updatedAt: timestamp
        });
      });

      legacyRecords.forEach(function (record) {
        var cells = {};

        mappedColumns.forEach(function (column) {
          cells[column.id] = String(record[column.key] || "");
        });

        rowsStore.add({
          cells: cells,
          createdAt: record.createdAt || timestamp,
          updatedAt: record.updatedAt || timestamp,
          migratedFromLegacy: true
        });
      });

      metaStore.put({ key: "legacyMigrated", value: true, updatedAt: timestamp });
      metaStore.put({ key: "defaultColumnsInitialized", value: true, updatedAt: timestamp });
    };
  }

  function withTransaction(storeNames, mode, executor) {
    return openDatabase().then(function (db) {
      return new Promise(function (resolve, reject) {
        var transaction = db.transaction(storeNames, mode);
        var result;
        var settled = false;

        function fail(error) {
          if (settled) {
            return;
          }

          settled = true;
          reject(error || new Error("本地数据库操作失败。"));
        }

        function setResult(value) {
          result = value;
        }

        transaction.oncomplete = function () {
          if (!settled) {
            settled = true;
            resolve(result);
          }
        };

        transaction.onerror = function () {
          fail(transaction.error);
        };

        transaction.onabort = function () {
          fail(transaction.error || new Error("本地数据库操作已取消。"));
        };

        try {
          executor(transaction, setResult, fail);
        } catch (error) {
          try {
            transaction.abort();
          } catch (abortError) {
            // 事务可能已经结束，直接返回原始错误。
          }
          fail(error);
        }
      });
    });
  }

  function sortColumns(columns) {
    return (columns || []).slice().sort(function (a, b) {
      var positionA = Number.isFinite(a.position) ? a.position : 0;
      var positionB = Number.isFinite(b.position) ? b.position : 0;

      if (positionA !== positionB) {
        return positionA - positionB;
      }

      return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    });
  }

  function sortRows(rows) {
    return (rows || []).slice().sort(function (a, b) {
      return Number(a.id) - Number(b.id);
    });
  }

  function getTable() {
    return withTransaction([COLUMN_STORE, ROW_STORE], "readonly", function (transaction, setResult) {
      var table = { columns: [], rows: [] };
      var columnsRequest = transaction.objectStore(COLUMN_STORE).getAll();
      var rowsRequest = transaction.objectStore(ROW_STORE).getAll();

      columnsRequest.onsuccess = function () {
        table.columns = sortColumns(columnsRequest.result);
      };

      rowsRequest.onsuccess = function () {
        table.rows = sortRows(rowsRequest.result);
      };

      setResult(table);
    });
  }

  function seedDefaultColumns() {
    return withTransaction([COLUMN_STORE, META_STORE], "readwrite", function (transaction, setResult) {
      var columnsStore = transaction.objectStore(COLUMN_STORE);
      var metaStore = transaction.objectStore(META_STORE);
      var countRequest = columnsStore.count();

      countRequest.onsuccess = function () {
        var timestamp;

        if (countRequest.result > 0) {
          setResult(false);
          return;
        }

        timestamp = now();

        DEFAULT_COLUMNS.forEach(function (column, index) {
          columnsStore.put({
            id: column.id,
            name: column.name,
            position: index,
            createdAt: timestamp,
            updatedAt: timestamp
          });
        });

        metaStore.put({
          key: "defaultColumnsInitialized",
          value: true,
          updatedAt: timestamp
        });
        setResult(true);
      };
    });
  }

  function addColumn(name) {
    return withTransaction([COLUMN_STORE], "readwrite", function (transaction, setResult) {
      var store = transaction.objectStore(COLUMN_STORE);
      var request = store.getAll();

      request.onsuccess = function () {
        var timestamp = now();
        var column = {
          id: createId("col"),
          name: name,
          position: request.result.length,
          createdAt: timestamp,
          updatedAt: timestamp
        };

        store.add(column);
        setResult(column);
      };
    });
  }

  function renameColumn(id, name) {
    return withTransaction([COLUMN_STORE], "readwrite", function (transaction, setResult, fail) {
      var store = transaction.objectStore(COLUMN_STORE);
      var request = store.get(id);

      request.onsuccess = function () {
        var column = request.result;

        if (!column) {
          fail(new Error("要重命名的列不存在，可能已被删除。"));
          return;
        }

        column.name = name;
        column.updatedAt = now();
        store.put(column);
        setResult(column);
      };
    });
  }

  function deleteColumn(id) {
    return withTransaction([COLUMN_STORE, ROW_STORE], "readwrite", function (transaction, setResult) {
      var columnsStore = transaction.objectStore(COLUMN_STORE);
      var rowsStore = transaction.objectStore(ROW_STORE);
      var rowsRequest = rowsStore.getAll();

      rowsRequest.onsuccess = function () {
        var timestamp = now();

        rowsRequest.result.forEach(function (row) {
          if (row.cells && Object.prototype.hasOwnProperty.call(row.cells, id)) {
            delete row.cells[id];
            row.updatedAt = timestamp;
            rowsStore.put(row);
          }
        });

        columnsStore.delete(id);
        setResult(true);
      };
    });
  }

  function addRow(cells) {
    return withTransaction([ROW_STORE], "readwrite", function (transaction, setResult) {
      var store = transaction.objectStore(ROW_STORE);
      var timestamp = now();
      var row = {
        cells: cells || {},
        createdAt: timestamp,
        updatedAt: timestamp
      };
      var request = store.add(row);

      request.onsuccess = function () {
        setResult(Object.assign({}, row, { id: request.result }));
      };
    });
  }

  function updateCell(rowId, columnId, value) {
    return withTransaction([ROW_STORE], "readwrite", function (transaction, setResult, fail) {
      var store = transaction.objectStore(ROW_STORE);
      var request = store.get(rowId);

      request.onsuccess = function () {
        var row = request.result;

        if (!row) {
          fail(new Error("要保存的行不存在，可能已被删除。"));
          return;
        }

        row.cells = row.cells || {};
        row.cells[columnId] = value;
        row.updatedAt = now();
        store.put(row);
        setResult(row);
      };
    });
  }

  function deleteRow(id) {
    return withTransaction([ROW_STORE], "readwrite", function (transaction, setResult) {
      transaction.objectStore(ROW_STORE).delete(id);
      setResult(true);
    });
  }

  function replaceAll(columns, rows) {
    return withTransaction([COLUMN_STORE, ROW_STORE], "readwrite", function (transaction, setResult) {
      var columnsStore = transaction.objectStore(COLUMN_STORE);
      var rowsStore = transaction.objectStore(ROW_STORE);
      var timestamp = now();

      columnsStore.clear();
      rowsStore.clear();

      columns.forEach(function (column, index) {
        columnsStore.put({
          id: column.id,
          name: column.name,
          position: index,
          createdAt: column.createdAt || timestamp,
          updatedAt: timestamp
        });
      });

      rows.forEach(function (row) {
        rowsStore.add({
          cells: row.cells || {},
          createdAt: row.createdAt || timestamp,
          updatedAt: row.updatedAt || timestamp
        });
      });

      setResult(true);
    });
  }

  window.RegistrationDB = {
    supportsIndexedDB: supportsIndexedDB,
    open: openDatabase,
    getTable: getTable,
    seedDefaultColumns: seedDefaultColumns,
    addColumn: addColumn,
    renameColumn: renameColumn,
    deleteColumn: deleteColumn,
    addRow: addRow,
    updateCell: updateCell,
    deleteRow: deleteRow,
    replaceAll: replaceAll
  };
})();
