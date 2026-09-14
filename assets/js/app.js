(function () {
  "use strict";

  var db = window.RegistrationDB;
  var state = {
    columns: [],
    rows: [],
    ready: false,
    searchQuery: ""
  };
  var elements = {};
  var confirmResolver = null;

  document.addEventListener("DOMContentLoaded", initialize);

  function initialize() {
    cacheElements();
    bindEvents();
    syncModalState();
    setStorageState("loading", "正在连接本地数据库…");

    if (!db || !db.supportsIndexedDB()) {
      setStorageState("error", "浏览器不支持本地数据库");
      showToast("当前浏览器不支持 IndexedDB，无法保存数据。", "error");
      render();
      return;
    }

    db.open()
      .then(function () {
        return db.seedDefaultColumns();
      })
      .then(function () {
        return db.getTable();
      })
      .then(function (table) {
        state.columns = table.columns || [];
        state.rows = table.rows || [];
        state.ready = true;
        render();
        setStorageState("ready", "数据已保存在本机");
      })
      .catch(function (error) {
        setStorageState("error", "本地数据库连接失败");
        showToast(error.message || "本地数据库连接失败。", "error");
        render();
      });
  }

  function cacheElements() {
    elements.importButton = document.getElementById("importButton");
    elements.exportButton = document.getElementById("exportButton");
    elements.importFileInput = document.getElementById("importFileInput");
    elements.addColumnButton = document.getElementById("addColumnButton");
    elements.addRowButton = document.getElementById("addRowButton");
    elements.tableCols = document.getElementById("tableCols");
    elements.tableHead = document.getElementById("tableHead");
    elements.tableBody = document.getElementById("tableBody");
    elements.tableShapeBadge = document.getElementById("tableShapeBadge");
    elements.cellAddress = document.getElementById("cellAddress");
    elements.formulaInput = document.getElementById("formulaInput");
    elements.searchInput = document.getElementById("searchInput");
    elements.clearSearchButton = document.getElementById("clearSearchButton");
    elements.searchSummary = document.getElementById("searchSummary");
    elements.storageState = document.getElementById("storageState");
    elements.storageText = document.getElementById("storageText");
    elements.columnModal = document.getElementById("columnModal");
    elements.columnModalTitle = document.getElementById("columnModalTitle");
    elements.columnForm = document.getElementById("columnForm");
    elements.columnNameInput = document.getElementById("columnNameInput");
    elements.columnNameError = document.getElementById("columnNameError");
    elements.saveColumnButton = document.getElementById("saveColumnButton");
    elements.closeColumnModalButton = document.getElementById("closeColumnModalButton");
    elements.cancelColumnButton = document.getElementById("cancelColumnButton");
    elements.confirmModal = document.getElementById("confirmModal");
    elements.confirmTitle = document.getElementById("confirmTitle");
    elements.confirmMessage = document.getElementById("confirmMessage");
    elements.confirmOkButton = document.getElementById("confirmOkButton");
    elements.confirmCancelButton = document.getElementById("confirmCancelButton");
    elements.confirmCloseButton = document.getElementById("confirmCloseButton");
    elements.toastRegion = document.getElementById("toastRegion");
  }

  function bindEvents() {
    elements.addRowButton.addEventListener("click", addRow);
    elements.addColumnButton.addEventListener("click", openColumnModal);
    elements.exportButton.addEventListener("click", exportCsv);
    elements.importButton.addEventListener("click", function () {
      elements.importFileInput.click();
    });
    elements.importFileInput.addEventListener("change", handleImportFile);
    elements.searchInput.addEventListener("input", handleSearchInput);
    elements.clearSearchButton.addEventListener("click", function () {
      clearSearch();
      elements.searchInput.focus();
    });

    elements.tableHead.addEventListener("click", handleHeadClick);
    elements.tableHead.addEventListener("dblclick", handleHeadDoubleClick);
    elements.tableBody.addEventListener("click", handleBodyClick);
    elements.tableBody.addEventListener("focusin", handleCellFocusIn);
    elements.tableBody.addEventListener("focusout", handleCellFocusOut);
    elements.tableBody.addEventListener("input", handleCellInput);
    elements.tableBody.addEventListener("keydown", handleCellKeyDown);
    elements.tableBody.addEventListener("paste", handleCellPaste);

    elements.columnForm.addEventListener("submit", handleColumnSubmit);
    elements.columnNameInput.addEventListener("input", function () {
      clearColumnError();
    });
    elements.closeColumnModalButton.addEventListener("click", closeColumnModal);
    elements.cancelColumnButton.addEventListener("click", closeColumnModal);
    elements.columnModal.addEventListener("mousedown", function (event) {
      if (event.target === elements.columnModal) {
        closeColumnModal();
      }
    });

    elements.confirmOkButton.addEventListener("click", function () {
      closeConfirm(true);
    });
    elements.confirmCancelButton.addEventListener("click", function () {
      closeConfirm(false);
    });
    elements.confirmCloseButton.addEventListener("click", function () {
      closeConfirm(false);
    });
    elements.confirmModal.addEventListener("mousedown", function (event) {
      if (event.target === elements.confirmModal) {
        closeConfirm(false);
      }
    });

    document.addEventListener("keydown", handleDocumentKeyDown);
  }

  function render() {
    cancelPendingCellSaves();
    resetFormulaBar();
    renderColumns();
    renderRows();
    elements.tableShapeBadge.textContent = state.rows.length + " 行 × " + state.columns.length + " 列";
    updateSearchUi();
  }

  function renderColumns() {
    var letterRow = document.createElement("tr");
    var titleRow = document.createElement("tr");
    var cornerHeader = document.createElement("th");
    var rowNumberHeader = document.createElement("th");
    var actionsLetter = document.createElement("th");
    var actionsHeader = document.createElement("th");

    elements.tableCols.textContent = "";
    elements.tableHead.textContent = "";

    elements.tableCols.appendChild(createCol("row-number-col", "46px"));
    state.columns.forEach(function () {
      elements.tableCols.appendChild(createCol("data-col", "160px"));
    });
    elements.tableCols.appendChild(createCol("actions-col", "76px"));

    cornerHeader.className = "row-number-header corner-cell";
    cornerHeader.scope = "col";
    cornerHeader.setAttribute("aria-label", "行号和列号");
    letterRow.appendChild(cornerHeader);

    state.columns.forEach(function (column, index) {
      var letterHeader = document.createElement("th");

      letterHeader.className = "column-letter";
      letterHeader.scope = "col";
      letterHeader.textContent = getColumnLetter(index);
      letterRow.appendChild(letterHeader);
    });

    actionsLetter.className = "column-letter actions-letter";
    actionsLetter.scope = "col";
    actionsLetter.setAttribute("aria-hidden", "true");
    letterRow.appendChild(actionsLetter);

    rowNumberHeader.className = "row-number-header";
    rowNumberHeader.scope = "col";
    rowNumberHeader.setAttribute("aria-label", "行号");
    titleRow.appendChild(rowNumberHeader);

    state.columns.forEach(function (column) {
      var th = document.createElement("th");
      var inner = document.createElement("div");
      var title = document.createElement("button");
      var deleteButton = document.createElement("button");

      th.className = "column-header";
      th.scope = "col";
      th.dataset.columnId = column.id;

      inner.className = "column-header-inner";

      title.type = "button";
      title.className = "column-title";
      title.textContent = column.name || "未命名列";
      title.title = "双击可重命名";
      title.setAttribute("aria-label", "列 " + (column.name || "未命名列") + "，双击重命名");

      deleteButton.type = "button";
      deleteButton.className = "column-delete";
      deleteButton.textContent = "×";
      deleteButton.title = "删除此列";
      deleteButton.setAttribute("aria-label", "删除列 " + (column.name || "未命名列"));

      inner.appendChild(title);
      inner.appendChild(deleteButton);
      th.appendChild(inner);
      titleRow.appendChild(th);
    });

    actionsHeader.className = "actions-header";
    actionsHeader.scope = "col";
    actionsHeader.textContent = "操作";
    titleRow.appendChild(actionsHeader);

    elements.tableHead.appendChild(letterRow);
    elements.tableHead.appendChild(titleRow);
  }

  function createCol(className, width) {
    var col = document.createElement("col");
    col.className = className;
    col.style.width = width;
    return col;
  }

  function getColumnLetter(index) {
    var number = index + 1;
    var letters = "";

    while (number > 0) {
      var remainder = (number - 1) % 26;
      letters = String.fromCharCode(65 + remainder) + letters;
      number = Math.floor((number - 1) / 26);
    }

    return letters;
  }

  function renderRows() {
    var visibleRows = getVisibleRows();

    elements.tableBody.textContent = "";

    if (state.rows.length === 0 || visibleRows.length === 0) {
      var emptyRow = document.createElement("tr");
      var emptyCell = document.createElement("td");

      emptyRow.className = "empty-row";
      emptyCell.colSpan = state.columns.length + 2;

      if (state.searchQuery) {
        emptyCell.innerHTML = "<strong>没有找到匹配内容</strong>换一个关键词试试，或点击查找框右侧的 × 清除查找";
      } else {
        emptyCell.innerHTML = "<strong>暂无数据</strong>点击下方“+ 新增行”开始录入吧";
      }

      emptyRow.appendChild(emptyCell);
      elements.tableBody.appendChild(emptyRow);
      return;
    }

    visibleRows.forEach(function (item) {
      elements.tableBody.appendChild(createDataRow(item.record, item.index));
    });
  }

  function getVisibleRows() {
    var query = state.searchQuery.toLocaleLowerCase("zh-CN");

    return state.rows.map(function (record, index) {
      return { record: record, index: index };
    }).filter(function (item) {
      if (!query) {
        return true;
      }

      return state.columns.some(function (column) {
        return matchesQuery(getCellValue(item.record, column.id));
      });
    });
  }

  function matchesQuery(value) {
    if (!state.searchQuery) {
      return false;
    }

    return String(value || "").toLocaleLowerCase("zh-CN").indexOf(state.searchQuery.toLocaleLowerCase("zh-CN")) !== -1;
  }

  function createDataRow(record, rowIndex) {
    var row = document.createElement("tr");
    var rowNumber = document.createElement("td");

    row.dataset.rowId = String(record.id);
    rowNumber.className = "row-number";
    rowNumber.textContent = String(rowIndex + 1);
    row.appendChild(rowNumber);

    state.columns.forEach(function (column) {
      var cell = document.createElement("td");
      var value = getCellValue(record, column.id);

      cell.className = "cell-editor";
      cell.contentEditable = "true";
      cell.spellcheck = false;
      cell.dataset.rowId = String(record.id);
      cell.dataset.columnId = column.id;
      cell.dataset.placeholder = "";
      cell.setAttribute("role", "textbox");
      cell.setAttribute("aria-label", column.name + "，第 " + (rowIndex + 1) + " 行");
      cell.textContent = value;
      cell._savedValue = value;

      if (matchesQuery(value)) {
        cell.classList.add("is-search-match");
      }

      row.appendChild(cell);
    });

    var actionCell = document.createElement("td");
    var deleteButton = document.createElement("button");

    actionCell.className = "actions-cell";
    deleteButton.type = "button";
    deleteButton.className = "row-delete-button";
    deleteButton.textContent = "删除";
    deleteButton.title = "删除这一行";
    deleteButton.setAttribute("aria-label", "删除第 " + (rowIndex + 1) + " 行");
    actionCell.appendChild(deleteButton);
    row.appendChild(actionCell);

    return row;
  }

  function getCellValue(record, columnId) {
    if (!record.cells || !Object.prototype.hasOwnProperty.call(record.cells, columnId)) {
      return "";
    }

    return String(record.cells[columnId] || "");
  }

  function getColumn(columnId) {
    for (var index = 0; index < state.columns.length; index += 1) {
      if (state.columns[index].id === columnId) {
        return state.columns[index];
      }
    }

    return null;
  }

  function getRow(rowId) {
    for (var index = 0; index < state.rows.length; index += 1) {
      if (String(state.rows[index].id) === String(rowId)) {
        return state.rows[index];
      }
    }

    return null;
  }

  function getColumnIndex(columnId) {
    for (var index = 0; index < state.columns.length; index += 1) {
      if (state.columns[index].id === columnId) {
        return index;
      }
    }

    return 0;
  }

  function getRowIndex(rowId) {
    for (var index = 0; index < state.rows.length; index += 1) {
      if (String(state.rows[index].id) === String(rowId)) {
        return index;
      }
    }

    return 0;
  }

  function updateFormulaBar(cell) {
    var columnId = cell.dataset.columnId;
    var rowId = cell.dataset.rowId;

    elements.cellAddress.textContent = getColumnLetter(getColumnIndex(columnId)) + (getRowIndex(rowId) + 1);
    elements.formulaInput.value = normalizeCellText(cell);
  }

  function resetFormulaBar() {
    elements.cellAddress.textContent = "A1";
    elements.formulaInput.value = "";
  }

  function getCellTarget(event) {
    if (!event.target || typeof event.target.closest !== "function") {
      return null;
    }

    return event.target.closest("td.cell-editor");
  }

  function handleHeadClick(event) {
    var deleteButton = event.target && event.target.closest ? event.target.closest(".column-delete") : null;
    var header;
    var column;

    if (!deleteButton) {
      return;
    }

    header = deleteButton.closest("th");
    column = header ? getColumn(header.dataset.columnId) : null;

    if (!column) {
      return;
    }

    if (state.columns.length <= 1) {
      showToast("至少需要保留一列。", "error");
      return;
    }

    askConfirm({
      title: "删除列",
      message: "确定要删除列“" + column.name + "”吗？这一列中的所有内容也会一起删除，操作无法撤销。",
      confirmText: "删除列",
      danger: true
    }).then(function (confirmed) {
      if (!confirmed) {
        return;
      }

      return db.deleteColumn(column.id).then(function () {
        state.columns = state.columns.filter(function (item) {
          return item.id !== column.id;
        });
        state.rows.forEach(function (record) {
          if (record.cells) {
            delete record.cells[column.id];
          }
        });
        render();
        setStorageState("saved", "已删除一列");
        showToast("已删除列“" + column.name + "”。");
      });
    }).catch(function (error) {
      showToast(error.message || "删除列失败。", "error");
    });
  }

  function handleHeadDoubleClick(event) {
    var title = event.target && event.target.closest ? event.target.closest(".column-title") : null;
    var header;
    var column;

    if (!title) {
      return;
    }

    header = title.closest("th");
    column = header ? getColumn(header.dataset.columnId) : null;

    if (column) {
      beginColumnRename(title, column);
    }
  }

  function beginColumnRename(titleElement, column) {
    var input = document.createElement("input");
    var finished = false;

    input.type = "text";
    input.className = "column-name-input";
    input.value = column.name;
    input.maxLength = 40;
    input.setAttribute("aria-label", "修改列名");
    titleElement.replaceWith(input);
    input.focus();
    input.select();

    function restore() {
      render();
    }

    function finish(save) {
      var nextName;

      if (finished) {
        return;
      }

      finished = true;
      nextName = input.value.trim();

      if (save && !nextName) {
        input.classList.add("is-invalid");
        input.title = "列名不能为空";
        finished = false;
        input.focus();
        return;
      }

      if (save && nextName !== column.name) {
        db.renameColumn(column.id, nextName)
          .then(function () {
            column.name = nextName;
            render();
            setStorageState("saved", "已重命名列");
            showToast("列名已修改为“" + nextName + "”。");
          })
          .catch(function (error) {
            render();
            showToast(error.message || "修改列名失败。", "error");
          });
      } else {
        restore();
      }
    }

    input.addEventListener("blur", function () {
      finish(true);
    });

    input.addEventListener("input", function () {
      input.classList.remove("is-invalid");
      input.title = "";
    });

    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        finished = true;
        restore();
      }
    });
  }

  function handleBodyClick(event) {
    var deleteButton = event.target && event.target.closest ? event.target.closest(".row-delete-button") : null;
    var rowElement;
    var record;

    if (!deleteButton) {
      return;
    }

    rowElement = deleteButton.closest("tr");
    record = rowElement ? getRow(rowElement.dataset.rowId) : null;

    if (!record) {
      return;
    }

    askConfirm({
      title: "删除行",
      message: "确定要删除这一行吗？该行中的所有单元格内容都会一起删除，操作无法撤销。",
      confirmText: "删除行",
      danger: true
    }).then(function (confirmed) {
      if (!confirmed) {
        return;
      }

      return db.deleteRow(record.id).then(function () {
        state.rows = state.rows.filter(function (item) {
          return String(item.id) !== String(record.id);
        });
        render();
        setStorageState("saved", "已删除一行");
        showToast("这一行已删除。");
      });
    }).catch(function (error) {
      showToast(error.message || "删除行失败。", "error");
    });
  }

  function handleCellFocusIn(event) {
    var cell = getCellTarget(event);

    if (cell) {
      cell.classList.add("is-editing");
      updateFormulaBar(cell);
    }
  }

  function handleCellFocusOut(event) {
    var cell = getCellTarget(event);

    if (!cell) {
      return;
    }

    cell.classList.remove("is-editing");
    commitCell(cell);
  }

  function handleCellInput(event) {
    var cell = getCellTarget(event);

    if (!cell) {
      return;
    }

    updateFormulaBar(cell);
    scheduleCellSave(cell);
  }

  function handleCellKeyDown(event) {
    var cell = getCellTarget(event);

    if (!cell) {
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      cell.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cell.textContent = cell._savedValue || "";
      cell.blur();
    }
  }

  function handleCellPaste(event) {
    var cell = getCellTarget(event);
    var text;

    if (!cell) {
      return;
    }

    event.preventDefault();
    text = event.clipboardData || window.clipboardData;
    text = text ? text.getData("text/plain") : "";
    text = String(text || "").replace(/\r\n?/g, "\n").replace(/\n/g, " ");

    if (!document.execCommand || !document.execCommand("insertText", false, text)) {
      insertPlainTextAtCursor(cell, text);
    }

    scheduleCellSave(cell);
  }

  function insertPlainTextAtCursor(cell, text) {
    var selection = window.getSelection();
    var range;
    var node;

    if (!selection || selection.rangeCount === 0) {
      cell.appendChild(document.createTextNode(text));
      return;
    }

    range = selection.getRangeAt(0);
    range.deleteContents();
    node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function scheduleCellSave(cell) {
    if (cell._saveTimer) {
      window.clearTimeout(cell._saveTimer);
    }

    cell._saveTimer = window.setTimeout(function () {
      cell._saveTimer = null;
      commitCell(cell);
    }, 550);
  }

  function cancelPendingCellSaves() {
    var cells = elements.tableBody.querySelectorAll(".cell-editor");

    cells.forEach(function (cell) {
      if (cell._saveTimer) {
        window.clearTimeout(cell._saveTimer);
        cell._saveTimer = null;
      }
    });
  }

  function normalizeCellText(cell) {
    return String(cell.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function commitCell(cell) {
    var rowId;
    var columnId;
    var nextValue;
    var previousValue;
    var record;

    if (!cell) {
      return Promise.resolve();
    }

    if (cell._saveTimer) {
      window.clearTimeout(cell._saveTimer);
      cell._saveTimer = null;
    }

    rowId = cell.dataset.rowId;
    columnId = cell.dataset.columnId;
    nextValue = normalizeCellText(cell);
    previousValue = cell._savedValue || "";

    if (nextValue === previousValue) {
      return Promise.resolve();
    }

    cell._savedValue = nextValue;

    return db.updateCell(rowId, columnId, nextValue)
      .then(function () {
        record = getRow(rowId);
        if (record) {
          record.cells = record.cells || {};
          record.cells[columnId] = nextValue;
        }
        cell.classList.toggle("is-search-match", matchesQuery(nextValue));
        if (document.activeElement === cell) {
          updateFormulaBar(cell);
        }
        setStorageState("saved", "已自动保存");
        cell.classList.add("is-saved");
        window.setTimeout(function () {
          cell.classList.remove("is-saved");
        }, 600);
      })
      .catch(function (error) {
        cell.textContent = previousValue;
        cell._savedValue = previousValue;
        setStorageState("error", "保存失败");
        showToast(error.message || "单元格保存失败。", "error");
      });
  }

  function addRow() {
    if (!state.columns.length) {
      showToast("请先新增一列。", "error");
      return;
    }

    if (state.searchQuery) {
      clearSearch();
    }

    db.addRow({})
      .then(function (record) {
        var firstColumn = state.columns[0];

        state.rows.push(record);
        render();
        setStorageState("saved", "已新增一行");
        focusCell(record.id, firstColumn.id);
      })
      .catch(function (error) {
        showToast(error.message || "新增行失败。", "error");
      });
  }

  function focusCell(rowId, columnId) {
    window.requestAnimationFrame(function () {
      var cell = elements.tableBody.querySelector(
        'td.cell-editor[data-row-id="' + rowId + '"][data-column-id="' + columnId + '"]'
      );

      if (!cell) {
        return;
      }

      cell.focus();
      placeCaretAtEnd(cell);
    });
  }

  function placeCaretAtEnd(element) {
    var range;
    var selection;

    if (!window.getSelection || !document.createRange) {
      return;
    }

    range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function handleSearchInput(event) {
    state.searchQuery = String(event.target.value || "").trim();
    renderRows();
    updateSearchUi();
  }

  function clearSearch() {
    state.searchQuery = "";
    elements.searchInput.value = "";
    renderRows();
    updateSearchUi();
  }

  function updateSearchUi() {
    var visibleCount = getVisibleRows().length;

    elements.clearSearchButton.hidden = !state.searchQuery;
    elements.searchSummary.hidden = !state.searchQuery;
    elements.searchSummary.textContent = state.searchQuery ? "找到 " + visibleCount + " 行" : "";
  }

  function openColumnModal() {
    clearColumnError();
    elements.columnNameInput.value = "";
    elements.columnModal.hidden = false;
    syncModalState();

    window.requestAnimationFrame(function () {
      elements.columnNameInput.focus();
    });
  }

  function closeColumnModal() {
    elements.columnModal.hidden = true;
    elements.columnForm.reset();
    clearColumnError();
    syncModalState();
  }

  function clearColumnError() {
    elements.columnNameInput.classList.remove("is-invalid");
    elements.columnNameInput.setCustomValidity("");
    elements.columnNameError.textContent = "";
  }

  function handleColumnSubmit(event) {
    var name = elements.columnNameInput.value.trim();

    event.preventDefault();
    clearColumnError();

    if (!name) {
      elements.columnNameInput.classList.add("is-invalid");
      elements.columnNameInput.setCustomValidity("请填写列名。");
      elements.columnNameError.textContent = "请填写列名。";
      elements.columnNameInput.focus();
      return;
    }

    elements.saveColumnButton.disabled = true;
    elements.saveColumnButton.textContent = "添加中…";

    db.addColumn(name)
      .then(function (column) {
        state.columns.push(column);
        render();
        closeColumnModal();
        setStorageState("saved", "已新增一列");
        showToast("已新增列“" + name + "”。");
      })
      .catch(function (error) {
        showToast(error.message || "新增列失败。", "error");
      })
      .finally(function () {
        elements.saveColumnButton.disabled = false;
        elements.saveColumnButton.textContent = "添加列";
      });
  }

  function handleImportFile(event) {
    var file = event.target.files && event.target.files[0];

    event.target.value = "";

    if (!file) {
      return;
    }

    decodeCsvFile(file)
      .then(function (text) {
        return importCsvText(file, text);
      })
      .catch(function (error) {
        showToast(error.message || "导入 CSV 失败。", "error");
      });
  }

  function decodeCsvFile(file) {
    if (typeof file.arrayBuffer === "function") {
      return file.arrayBuffer().then(decodeCsvBuffer);
    }

    return new Promise(function (resolve, reject) {
      var reader = new FileReader();

      reader.onload = function () {
        resolve(String(reader.result || ""));
      };
      reader.onerror = function () {
        reject(new Error("无法读取 CSV 文件。"));
      };
      reader.readAsText(file, "utf-8");
    });
  }

  function decodeCsvBuffer(buffer) {
    var bytes = new Uint8Array(buffer);
    var utf8Text;
    var badUtf8Count;

    if (typeof TextDecoder === "undefined") {
      return String.fromCharCode.apply(null, bytes);
    }

    utf8Text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    badUtf8Count = (utf8Text.match(/\uFFFD/g) || []).length;

    if (badUtf8Count > 0) {
      try {
        var gbkText = new TextDecoder("gbk", { fatal: false }).decode(bytes);
        var badGbkCount = (gbkText.match(/\uFFFD/g) || []).length;

        if (badGbkCount < badUtf8Count) {
          return gbkText;
        }
      } catch (error) {
        // 浏览器不支持 GBK 时继续使用 UTF-8 结果。
      }
    }

    return utf8Text;
  }

  function parseCsv(text) {
    var rows = [];
    var row = [];
    var field = "";
    var inQuotes = false;
    var index;
    var character;

    text = String(text || "").replace(/^\uFEFF/, "");

    for (index = 0; index < text.length; index += 1) {
      character = text[index];

      if (inQuotes) {
        if (character === '"') {
          if (text[index + 1] === '"') {
            field += '"';
            index += 1;
          } else {
            inQuotes = false;
          }
        } else {
          field += character;
        }
      } else if (character === '"') {
        inQuotes = true;
      } else if (character === ",") {
        row.push(field);
        field = "";
      } else if (character === "\r" || character === "\n") {
        if (character === "\r" && text[index + 1] === "\n") {
          index += 1;
        }
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += character;
      }
    }

    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    return rows;
  }

  function importCsvText(file, text) {
    var parsed = parseCsv(text);
    var dataRows;
    var columnCount;
    var headers;
    var columns;
    var records;
    var timestamp;

    if (parsed.length === 0) {
      throw new Error("CSV 文件是空的。");
    }

    headers = parsed[0].map(function (value, index) {
      var name = String(value || "").trim();
      return name || "列" + (index + 1);
    });

    dataRows = parsed.slice(1).filter(function (row) {
      return row.some(function (value) {
        return String(value || "").trim() !== "";
      });
    });

    columnCount = headers.length;
    dataRows.forEach(function (row) {
      columnCount = Math.max(columnCount, row.length);
    });

    if (columnCount === 0) {
      throw new Error("没有识别到可导入的列。");
    }

    for (var headerIndex = headers.length; headerIndex < columnCount; headerIndex += 1) {
      headers.push("列" + (headerIndex + 1));
    }

    timestamp = new Date().toISOString();
    columns = headers.map(function (name, index) {
      return {
        id: createId("col"),
        name: name,
        position: index,
        createdAt: timestamp,
        updatedAt: timestamp
      };
    });

    records = dataRows.map(function (row) {
      var cells = {};

      columns.forEach(function (column, index) {
        cells[column.id] = row[index] === undefined ? "" : String(row[index]);
      });

      return {
        cells: cells,
        createdAt: timestamp,
        updatedAt: timestamp
      };
    });

    return askConfirm({
      title: "导入 CSV",
      message: "将使用文件“" + file.name + "”覆盖当前表格，导入后会有 " + records.length + " 行、" + columns.length + " 列。当前数据会被替换，操作无法撤销。",
      confirmText: "覆盖并导入",
      danger: true
    }).then(function (confirmed) {
      if (!confirmed) {
        return;
      }

      return db.replaceAll(columns, records)
        .then(function () {
          return db.getTable();
        })
        .then(function (table) {
          state.columns = table.columns || [];
          state.rows = table.rows || [];
          state.searchQuery = "";
          elements.searchInput.value = "";
          render();
          setStorageState("saved", "已导入并保存");
          showToast("已导入 " + state.rows.length + " 行数据。");
        });
    });
  }

  function exportCsv() {
    var headers;
    var rows;
    var csv;
    var blob;
    var url;
    var link;
    var nowDate;
    var filename;

    if (!state.columns.length) {
      showToast("当前没有可导出的列。", "error");
      return;
    }

    headers = state.columns.map(function (column) {
      return column.name || "未命名列";
    });

    rows = state.rows.map(function (record) {
      return state.columns.map(function (column) {
        return getCellValue(record, column.id);
      });
    });

    csv = [headers].concat(rows).map(function (row) {
      return row.map(escapeCsvValue).join(",");
    }).join("\r\n");

    blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    url = URL.createObjectURL(blob);
    link = document.createElement("a");
    nowDate = new Date();
    filename = "表格-" + nowDate.getFullYear() + padNumber(nowDate.getMonth() + 1) + padNumber(nowDate.getDate()) +
      "-" + padNumber(nowDate.getHours()) + padNumber(nowDate.getMinutes()) + padNumber(nowDate.getSeconds()) + ".csv";

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 0);

    showToast("已导出 " + state.rows.length + " 行数据。");
  }

  function padNumber(value) {
    return String(value).padStart(2, "0");
  }

  function escapeCsvValue(value) {
    var text = String(value === undefined || value === null ? "" : value);

    if (/^[ \t]|[ \t]$|[",\r\n]/.test(text)) {
      return '"' + text.replace(/"/g, '""') + '"';
    }

    return text;
  }

  function askConfirm(options) {
    if (confirmResolver) {
      confirmResolver(false);
      confirmResolver = null;
    }

    elements.confirmTitle.textContent = options.title || "确认操作";
    elements.confirmMessage.textContent = options.message || "";
    elements.confirmOkButton.textContent = options.confirmText || "确认";
    elements.confirmOkButton.className = "button " + (options.danger ? "button-danger" : "button-primary");
    elements.confirmModal.hidden = false;
    syncModalState();

    return new Promise(function (resolve) {
      confirmResolver = resolve;
      window.requestAnimationFrame(function () {
        elements.confirmOkButton.focus();
      });
    });
  }

  function closeConfirm(result) {
    var resolve = confirmResolver;

    confirmResolver = null;
    elements.confirmModal.hidden = true;
    syncModalState();

    if (resolve) {
      resolve(result);
    }
  }

  function handleDocumentKeyDown(event) {
    if ((event.ctrlKey || event.metaKey) && String(event.key || "").toLowerCase() === "f") {
      event.preventDefault();
      elements.searchInput.focus();
      elements.searchInput.select();
      return;
    }

    if (event.key !== "Escape") {
      return;
    }

    if (!elements.confirmModal.hidden) {
      event.preventDefault();
      closeConfirm(false);
    } else if (!elements.columnModal.hidden) {
      event.preventDefault();
      closeColumnModal();
    }
  }

  function syncModalState() {
    var hasOpenModal = !elements.columnModal.hidden || !elements.confirmModal.hidden;
    document.body.classList.toggle("modal-open", hasOpenModal);
  }

  function setStorageState(status, message) {
    elements.storageState.className = "storage-state is-" + status;
    elements.storageText.textContent = message;
  }

  function showToast(message, type) {
    var toast = document.createElement("div");

    toast.className = "toast" + (type === "error" ? " is-error" : "");
    toast.textContent = message;
    elements.toastRegion.appendChild(toast);

    window.setTimeout(function () {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(8px)";
      window.setTimeout(function () {
        toast.remove();
      }, 180);
    }, 2600);
  }

  function createId(prefix) {
    return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }
})();
