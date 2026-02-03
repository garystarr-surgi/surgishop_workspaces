/**
 * SurgiShop ERP Scanner - Custom Barcode Scanner Override
 * Overrides ERPNext's default barcode scanning with custom functionality
 */

// Namespace for our custom code to avoid polluting the global scope
if (typeof window.surgishop === "undefined") {
  window.surgishop = {};
}

// Suppress ERPNext's internal DOM timing errors during barcode scanning
// These errors occur when ERPNext tries to refresh grid fields before DOM is ready
// The errors are harmless - values still get set correctly
window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  // Check various ways the error message might be structured
  const message =
    (reason && reason.message) || (reason && String(reason)) || "";

  if (
    message.includes("can't access property") ||
    message.includes("cannot read property") ||
    (message.includes("parent") && message.includes("undefined"))
  ) {
    // Suppress this specific ERPNext timing error
    event.preventDefault();
    event.stopPropagation();
    return false;
  }
});

// Also catch synchronous errors from ERPNext grid refresh
window.addEventListener("error", (event) => {
  const message = event.message || "";
  if (
    message.includes("can't access property") ||
    message.includes("cannot read property") ||
    (message.includes("parent") && message.includes("undefined"))
  ) {
    event.preventDefault();
    event.stopPropagation();
    return false;
  }
});

// Scanner state flags
window.surgishop.forceNewRow = false;
window.surgishop.forcePromptQty = false;
window.surgishop.pendingCondition = null;
window.surgishop.pendingConditionWarehouse = null;

// Settings (will be loaded from SurgiShop Settings)
window.surgishop.settings = {
  enableScanSounds: true,
  promptForQuantity: false,
  defaultScanQuantity: 1,
  autoCreateBatches: true,
  disableSerialBatchSelector: true,
  newLineTriggerBarcode: null,
  conditionTriggerBarcode: null,
  quantityTriggerBarcode: null,
  deleteRowTriggerBarcode: null,
  warnOnExpiryMismatch: true,
  updateMissingExpiry: true,
  strictGtinValidation: false,
  promptCreateItemOnUnknownGtin: true,
};

/**
 * Our custom scanner class.
 * All the logic for parsing and handling scans is contained here.
 */
surgishop.CustomBarcodeScanner = class CustomBarcodeScanner {
  constructor(opts) {
    this.frm = opts.frm;
    this.scan_field_name = opts.scan_field_name || "scan_barcode";
    this.scan_barcode_field = this.frm.fields_dict[this.scan_field_name];
    this.barcode_field = opts.barcode_field || "barcode";
    this.serial_no_field = opts.serial_no_field || "serial_no";
    this.batch_no_field = opts.batch_no_field || "batch_no";
    this.batch_expiry_date_field =
      opts.batch_expiry_date_field || "custom_expiration_date";
    this.uom_field = opts.uom_field || "uom";
    this.qty_field = opts.qty_field || "qty";
    this.warehouse_field = opts.warehouse_field || "warehouse";
    this.condition_field = opts.condition_field || "custom_condition";
    this.max_qty_field = opts.max_qty_field;
    this.dont_allow_new_row = opts.dont_allow_new_row;
    this.items_table_name = opts.items_table_name || "items";

    // Use settings for sounds
    const settings = window.surgishop.settings;
    this.enable_sounds = settings.enableScanSounds;
    this.success_sound = this.enable_sounds ? "submit" : null;
    this.fail_sound = this.enable_sounds ? "error" : null;

    // Use settings for quantity behavior
    this.prompt_qty = opts.prompt_qty || settings.promptForQuantity;
    this.default_qty = settings.defaultScanQuantity || 1;

    this.scan_api =
      opts.scan_api ||
      "surgishop_erp_scanner.surgishop_erp_scanner.api.barcode.scan_barcode";
    this.gs1_parser_api =
      "surgishop_erp_scanner.surgishop_erp_scanner.api.gs1_parser.parse_gs1_and_get_batch";
    this.has_last_scanned_warehouse = frappe.meta.has_field(
      this.frm.doctype,
      "last_scanned_warehouse"
    );
  }

  /**
   * Parses a GS1 string using the shared GS1Parser utility.
   * @param {string} gs1_string The raw scanned string
   * @returns {object|null} Parsed data {gtin, lot, expiry} or null if not matching
   */
  parse_gs1_string(gs1_string) {
    if (window.surgishop && window.surgishop.GS1Parser) {
      return window.surgishop.GS1Parser.parse(gs1_string);
    } else {
      return null;
    }
  }

  /**
   * Check if this is a special trigger barcode
   * @param {string} input The scanned barcode
   * @returns {boolean} True if this is a trigger barcode that was handled
   */
  check_trigger_barcode(input) {
    const settings = window.surgishop.settings;

    // New Line Trigger
    if (
      settings.newLineTriggerBarcode &&
      input === settings.newLineTriggerBarcode
    ) {
      window.surgishop.forceNewRow = true;
      this.show_alert(
        "New Line Mode: Next scan will create a new row",
        "orange",
        3
      );
      this.play_success_sound();
      return true;
    }

    // Condition Trigger
    if (
      settings.conditionTriggerBarcode &&
      input === settings.conditionTriggerBarcode
    ) {
      this.prompt_for_condition();
      return true;
    }

    // Quantity Trigger
    if (
      settings.quantityTriggerBarcode &&
      input === settings.quantityTriggerBarcode
    ) {
      window.surgishop.forcePromptQty = true;
      this.show_alert(
        "Quantity Mode: Next scan will prompt for quantity",
        "blue",
        3
      );
      this.play_success_sound();
      return true;
    }

    // Delete Row Trigger
    if (
      settings.deleteRowTriggerBarcode &&
      input === settings.deleteRowTriggerBarcode
    ) {
      this.delete_last_row();
      return true;
    }

    return false;
  }

  /**
   * Prompt for condition selection with touch-friendly dialog
   */
  prompt_for_condition() {
    // Fetch condition options via custom API (bypasses permission issues)
    frappe.call({
      method:
        "surgishop_erp_scanner.surgishop_erp_scanner.api.barcode.get_condition_options",
      callback: (r) => {
        let options = r && r.message ? r.message : [];

        if (options.length === 0) {
          this.show_alert(
            "No condition options configured. Please add options in SurgiShop Condition Settings.",
            "orange",
            5
          );
          this.play_fail_sound();
          return;
        }

        this.show_touch_condition_dialog(options);
      },
      error: () => {
        this.show_alert("Failed to load condition options.", "red", 5);
        this.play_fail_sound();
      },
    });
  }

  /**
   * Show touch-friendly condition dialog (tap to select and apply)
   * @param {Array} options - List of condition options
   */
  show_touch_condition_dialog(options) {
    const self = this;
    const settings = window.surgishop.settings;

    // Determine default warehouse selection based on settings
    let defaultWarehouse = "none";
    if (settings.conditionWarehouseBehavior === "Use Accepted Warehouse") {
      defaultWarehouse = "accepted";
    } else if (
      settings.conditionWarehouseBehavior === "Use Rejected Warehouse"
    ) {
      defaultWarehouse = "rejected";
    }

    // Build warehouse section HTML (only show if warehouses are configured)
    const hasAccepted = settings.acceptedWarehouse;
    const hasRejected = settings.rejectedWarehouse;
    const showWarehouseSection = hasAccepted || hasRejected;

    const warehouseSectionHtml = showWarehouseSection
      ? `
        <div class="warehouse-section">
          <div class="warehouse-label">Warehouse:</div>
          <div class="warehouse-toggle">
            ${
              hasAccepted
                ? `<button type="button" class="warehouse-btn ${
                    defaultWarehouse === "accepted" ? "selected" : ""
                  }" data-warehouse="accepted">
                  ✓ Accepted
                </button>`
                : ""
            }
            ${
              hasRejected
                ? `<button type="button" class="warehouse-btn ${
                    defaultWarehouse === "rejected" ? "selected" : ""
                  }" data-warehouse="rejected">
                  ✗ Rejected
                </button>`
                : ""
            }
            <button type="button" class="warehouse-btn ${
              defaultWarehouse === "none" ? "selected" : ""
            }" data-warehouse="none">
              Default
            </button>
          </div>
        </div>
      `
      : "";

    // Create custom dialog with large touch-friendly buttons
    const dialog = new frappe.ui.Dialog({
      title: "Tap a Condition",
      size: "large",
      fields: [
        {
          fieldtype: "HTML",
          fieldname: "condition_buttons",
          options: `
            <style>
              .warehouse-section {
                padding: 12px 0 16px 0;
                border-bottom: 1px solid var(--border-color);
                margin-bottom: 12px;
              }
              .warehouse-label {
                font-size: 14px;
                font-weight: 600;
                color: var(--text-muted);
                margin-bottom: 8px;
              }
              .warehouse-toggle {
                display: flex;
                gap: 10px;
                flex-wrap: wrap;
              }
              .warehouse-btn {
                padding: 12px 20px;
                font-size: 15px;
                font-weight: 500;
                border: 2px solid var(--border-color);
                border-radius: 6px;
                background: var(--bg-color);
                color: var(--text-color);
                cursor: pointer;
                transition: all 0.15s ease;
                user-select: none;
                -webkit-tap-highlight-color: transparent;
              }
              .warehouse-btn:hover {
                border-color: var(--primary-color);
              }
              .warehouse-btn.selected {
                background: var(--primary-color);
                border-color: var(--primary-color);
                color: white;
              }
              .condition-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                gap: 12px;
                padding: 10px 0;
                max-height: 60vh;
                overflow-y: auto;
              }
              .condition-btn {
                padding: 20px 16px;
                font-size: 16px;
                font-weight: 500;
                border: 2px solid var(--border-color);
                border-radius: 8px;
                background: var(--bg-color);
                color: var(--text-color);
                cursor: pointer;
                transition: all 0.15s ease;
                text-align: center;
                min-height: 70px;
                display: flex;
                align-items: center;
                justify-content: center;
                user-select: none;
                -webkit-tap-highlight-color: transparent;
              }
              .condition-btn:hover {
                border-color: var(--primary-color);
                background: var(--control-bg);
              }
              .condition-btn:active {
                transform: scale(0.96);
                background: var(--primary-color);
                border-color: var(--primary-color);
                color: white;
              }
              @media (max-width: 768px) {
                .warehouse-toggle {
                  flex-direction: column;
                }
                .warehouse-btn {
                  padding: 14px 20px;
                  font-size: 16px;
                }
                .condition-grid {
                  grid-template-columns: 1fr;
                }
                .condition-btn {
                  padding: 24px 16px;
                  font-size: 18px;
                  min-height: 80px;
                }
              }
            </style>
            ${warehouseSectionHtml}
            <div class="condition-grid">
              ${options
                .map(
                  (opt) => `
                <button type="button" class="condition-btn" data-condition="${opt.replace(
                  /"/g,
                  "&quot;"
                )}">
                  ${opt}
                </button>
              `
                )
                .join("")}
            </div>
          `,
        },
      ],
    });

    // Track selected warehouse
    let selectedWarehouse = defaultWarehouse;

    // Hide the default footer buttons
    dialog.$wrapper.find(".modal-footer").hide();

    dialog.show();

    // Handle warehouse toggle clicks
    dialog.$wrapper.find(".warehouse-btn").on("click", function (e) {
      e.preventDefault();
      e.stopPropagation();

      dialog.$wrapper.find(".warehouse-btn").removeClass("selected");
      $(this).addClass("selected");
      selectedWarehouse = $(this).data("warehouse");
    });

    // Tap to select AND apply immediately
    dialog.$wrapper.find(".condition-btn").on("click", function (e) {
      e.preventDefault();
      e.stopPropagation();

      const condition = $(this).data("condition");

      // Store both condition and warehouse selection
      window.surgishop.pendingCondition = condition;
      window.surgishop.pendingConditionWarehouse = selectedWarehouse;

      // Build message
      let message = `Condition "${condition}" will be applied to next scan`;
      if (selectedWarehouse === "accepted" && settings.acceptedWarehouse) {
        message += ` → ${settings.acceptedWarehouse}`;
      } else if (
        selectedWarehouse === "rejected" &&
        settings.rejectedWarehouse
      ) {
        message += ` → ${settings.rejectedWarehouse}`;
      }

      self.show_alert(message, "green", 3);
      self.play_success_sound();
      dialog.hide();
    });
  }

  /**
   * Delete the last row from items table
   */
  delete_last_row() {
    const items = this.frm.doc[this.items_table_name] || [];
    if (items.length === 0) {
      this.show_alert("No items to delete", "orange");
      this.play_fail_sound();
      return;
    }

    const lastRow = items[items.length - 1];
    const itemCode = lastRow.item_code || "empty row";

    frappe.model.clear_doc(lastRow.doctype, lastRow.name);
    this.frm.refresh_field(this.items_table_name);

    this.show_alert(`Deleted row: ${itemCode}`, "red", 3);
    this.play_success_sound();
  }

  process_scan() {
    return new Promise((resolve, reject) => {
      try {
        const input = this.scan_barcode_field.value;
        this.scan_barcode_field.set_value("");
        if (!input) {
          return resolve();
        }

        // Check for trigger barcodes first
        if (this.check_trigger_barcode(input)) {
          return resolve();
        }

        // Try to parse as GS1 first
        const gs1_data = this.parse_gs1_string(input);

        if (gs1_data) {
          this.show_alert(
            `Scanned GS1 AIs:\nGTIN: ${gs1_data.gtin}\nExpiry: ${gs1_data.expiry}\nLot: ${gs1_data.lot}`,
            "blue",
            5
          );
          this.gs1_api_call(gs1_data, (r) =>
            this.handle_api_response(r, resolve, reject)
          );
        } else {
          this.scan_api_call(input, (r) =>
            this.handle_api_response(r, resolve, reject)
          );
        }
      } catch (e) {
        reject(e);
      }
    });
  }

  handle_api_response(r, resolve, reject) {
    try {
      const data = r && r.message;
      if (!data || Object.keys(data).length === 0 || data.error) {
        const error_msg =
          data && data.error
            ? data.error
            : "Cannot find Item with this Barcode";
        this.show_alert(
          `Error: ${error_msg}. Check console for details.`,
          "red"
        );
        this.clean_up();
        this.play_fail_sound();
        reject(new Error(error_msg));
        return;
      }

      // Handle GTIN not found - prompt to create new Item
      if (data.gtin_not_found) {
        this.handle_gtin_not_found(data);
        this.clean_up();
        resolve();
        return;
      }

      // Handle warehouse-only responses
      if (data.warehouse && !data.item_code) {
        this.handle_warehouse_scan(data.warehouse);
        this.clean_up();
        this.play_success_sound();
        resolve();
        return;
      }

      // Handle item responses (with item_code)
      if (!data.item_code) {
        this.show_alert("No item found for this barcode", "red");
        this.clean_up();
        this.play_fail_sound();
        reject(new Error("No item found"));
        return;
      }

      this.update_table(data)
        .then((row) => {
          this.play_success_sound();
          resolve(row);
        })
        .catch((err) => {
          this.play_fail_sound();
          reject(err);
        });
    } catch (e) {
      reject(e);
    }
  }

  handle_warehouse_scan(warehouse_name) {
    if (frappe.meta.has_field(this.frm.doctype, "set_warehouse")) {
      frappe.model.set_value(
        this.frm.doctype,
        this.frm.doc.name,
        "set_warehouse",
        warehouse_name
      );
    }

    if (this.has_last_scanned_warehouse) {
      frappe.model.set_value(
        this.frm.doctype,
        this.frm.doc.name,
        "last_scanned_warehouse",
        warehouse_name
      );
    }

    this.show_alert(`Warehouse set to: ${warehouse_name}`, "green", 3);
    this.frm.refresh_fields();

    const warehouse_field = this.get_warehouse_field();
    if (
      warehouse_field &&
      frappe.meta.has_field(this.frm.doctype, this.items_table_name)
    ) {
      const items = this.frm.doc[this.items_table_name] || [];
      items.forEach((row) => {
        if (row[warehouse_field]) {
          frappe.model.set_value(row.doctype, row.name, warehouse_field, "");
        }
      });
    }
  }

  /**
   * Handle GTIN not found - prompt user to search for existing item or create new
   * @param {object} data - Contains gtin, lot, expiry from the scan
   */
  handle_gtin_not_found(data) {
    const self = this;
    const { gtin, lot, expiry } = data;
    const settings = window.surgishop.settings;
    const useInlineCreate = settings.createItemInline !== false;

    // Format expiry date for display if present
    let expiryDisplay = "";
    if (expiry && expiry.length === 6) {
      try {
        const year = "20" + expiry.substring(0, 2);
        const month = expiry.substring(2, 4);
        const day = expiry.substring(4, 6);
        expiryDisplay = `${year}-${month}-${day}`;
      } catch (e) {
        expiryDisplay = expiry;
      }
    }

    // Build fields array
    const fields = [
      {
        fieldtype: "HTML",
        fieldname: "info_html",
        options: `
          <div style="margin-bottom: 15px;">
            <p style="margin-bottom: 10px;">
              <strong>No item found for the scanned GTIN.</strong>
            </p>
            <div style="background: var(--bg-light-gray); padding: 12px; border-radius: 6px; font-family: monospace;">
              <div><strong>GTIN:</strong> ${frappe.utils.escape_html(
                gtin
              )}</div>
              ${
                lot
                  ? `<div><strong>Lot:</strong> ${frappe.utils.escape_html(
                      lot
                    )}</div>`
                  : ""
              }
              ${
                expiryDisplay
                  ? `<div><strong>Expiry:</strong> ${frappe.utils.escape_html(
                      expiryDisplay
                    )}</div>`
                  : ""
              }
            </div>
          </div>
        `,
      },
      {
        fieldtype: "Section Break",
        label: "Attach to Existing Item",
      },
      {
        fieldtype: "Link",
        fieldname: "existing_item",
        label: "Search for Item",
        options: "Item",
        description: "Search by item code, name, or description",
      },
      {
        fieldtype: "Button",
        fieldname: "attach_btn",
        label: "Attach Barcode to Selected Item",
        btn_size: "lg",
      },
      {
        fieldtype: "Section Break",
        label: "Or Create New Item",
      },
    ];

    // Add inline create fields or description based on setting
    if (useInlineCreate) {
      fields.push(
        {
          fieldtype: "Data",
          fieldname: "new_item_name",
          label: "Item Name",
          reqd: 0,
          description:
            "Enter a name for the new item (will also be used as Item Code)",
        },
        {
          fieldtype: "HTML",
          fieldname: "inline_info",
          options: `
            <p style="color: var(--text-muted); font-size: 12px; margin-top: 5px;">
              <strong>Note:</strong> Item will be created with Batch tracking and Expiry Date enabled.
            </p>
          `,
        },
        {
          fieldtype: "Button",
          fieldname: "create_inline_btn",
          label: "Create Item",
          btn_size: "lg",
        }
      );
    } else {
      fields.push({
        fieldtype: "HTML",
        fieldname: "create_section",
        options: `
          <p style="color: var(--text-muted); margin-bottom: 10px;">
            If the item doesn't exist yet, create a new one with this barcode pre-filled.
          </p>
        `,
      });
    }

    // Show dialog with search option and create new option
    const dialog = new frappe.ui.Dialog({
      title: "Item Not Found",
      size: "large",
      fields: fields,
      primary_action_label: useInlineCreate ? "Cancel" : "Create New Item",
      primary_action: function () {
        if (useInlineCreate) {
          dialog.hide();
          self.play_fail_sound();
        } else {
          dialog.hide();
          self.open_new_item_form(gtin, lot, expiry);
        }
      },
      secondary_action_label: useInlineCreate ? null : "Cancel",
      secondary_action: useInlineCreate
        ? null
        : function () {
            dialog.hide();
            self.play_fail_sound();
          },
    });

    // Handle attach button click
    dialog.fields_dict.attach_btn.$input.on("click", function () {
      const selected_item = dialog.get_value("existing_item");
      if (!selected_item) {
        frappe.show_alert({
          message: "Please select an item first",
          indicator: "orange",
        });
        return;
      }

      // Attach barcode to the selected item
      self.attach_barcode_to_item(selected_item, gtin, lot, expiry, dialog);
    });

    // Style the attach button
    dialog.fields_dict.attach_btn.$input
      .removeClass("btn-default btn-xs")
      .addClass("btn-primary btn-md")
      .css({
        "margin-top": "10px",
        padding: "10px 20px",
        "font-size": "14px",
      });

    // Handle inline create button if enabled
    if (useInlineCreate && dialog.fields_dict.create_inline_btn) {
      dialog.fields_dict.create_inline_btn.$input.on("click", function () {
        const item_name = dialog.get_value("new_item_name");
        if (!item_name || !item_name.trim()) {
          frappe.show_alert({
            message: "Please enter an item name",
            indicator: "orange",
          });
          return;
        }

        self.create_item_inline(item_name.trim(), gtin, lot, expiry, dialog);
      });

      // Style the create button
      dialog.fields_dict.create_inline_btn.$input
        .removeClass("btn-default btn-xs")
        .addClass("btn-success btn-md")
        .css({
          "margin-top": "10px",
          padding: "10px 20px",
          "font-size": "14px",
        });
    }

    dialog.show();

    // Auto-focus the item name field if inline create is enabled
    if (useInlineCreate && dialog.fields_dict.new_item_name) {
      setTimeout(() => {
        dialog.fields_dict.new_item_name.$input.focus();
      }, 100);
    }

    this.play_fail_sound();
  }

  /**
   * Attach a barcode to an existing item
   * @param {string} item_code - The item to attach the barcode to
   * @param {string} gtin - The GTIN/barcode
   * @param {string} lot - The lot number (optional)
   * @param {string} expiry - The expiry in YYMMDD format (optional)
   * @param {object} dialog - The dialog to close on success
   */
  attach_barcode_to_item(item_code, gtin, lot, expiry, dialog) {
    const self = this;

    frappe.call({
      method: "frappe.client.insert",
      args: {
        doc: {
          doctype: "Item Barcode",
          parent: item_code,
          parenttype: "Item",
          parentfield: "barcodes",
          barcode: gtin,
          barcode_type: "GS1",
        },
      },
      freeze: true,
      freeze_message: "Attaching barcode to item...",
      callback: function (r) {
        if (r && !r.exc) {
          dialog.hide();
          self.show_alert(
            `Barcode ${gtin} attached to ${item_code}. Scan again to add to document.`,
            "green",
            5
          );
          self.play_success_sound();
        }
      },
      error: function () {
        frappe.show_alert({
          message: "Failed to attach barcode. It may already exist.",
          indicator: "red",
        });
        self.play_fail_sound();
      },
    });
  }

  /**
   * Create a new Item inline with batch/expiry tracking enabled
   * @param {string} item_name - The name for the new item
   * @param {string} gtin - The GTIN/barcode
   * @param {string} lot - The lot number (optional)
   * @param {string} expiry - The expiry in YYMMDD format (optional)
   * @param {object} dialog - The dialog to close on success
   */
  create_item_inline(item_name, gtin, lot, expiry, dialog) {
    const self = this;

    frappe.call({
      method: "frappe.client.insert",
      args: {
        doc: {
          doctype: "Item",
          item_code: item_name,
          item_name: item_name,
          item_group: "Products", // Default group - will be overridden if needed
          stock_uom: "Nos",
          is_stock_item: 1,
          has_batch_no: 1,
          create_new_batch: 1,
          has_expiry_date: 1,
          barcodes: [
            {
              barcode: gtin,
              barcode_type: "GS1",
            },
          ],
        },
      },
      freeze: true,
      freeze_message: "Creating new item...",
      callback: function (r) {
        if (r && r.message) {
          const new_item_code = r.message.name;
          dialog.hide();
          self.show_alert(
            `Item "${new_item_code}" created with barcode ${gtin}. Scan again to add to document.`,
            "green",
            5
          );
          self.play_success_sound();
        }
      },
      error: function (r) {
        let error_msg = "Failed to create item.";
        if (r && r._server_messages) {
          try {
            const messages = JSON.parse(r._server_messages);
            if (messages.length > 0) {
              const msg = JSON.parse(messages[0]);
              error_msg = msg.message || error_msg;
            }
          } catch (e) {
            // Use default error message
          }
        }
        frappe.show_alert({
          message: error_msg,
          indicator: "red",
        });
        self.play_fail_sound();
      },
    });
  }

  /**
   * Open a new Item form pre-filled with the scanned barcode
   * @param {string} gtin - The GTIN/barcode
   * @param {string} lot - The lot number (optional)
   * @param {string} expiry - The expiry in YYMMDD format (optional)
   */
  open_new_item_form(gtin, lot, expiry) {
    // Navigate to new Item form
    frappe.new_doc("Item", {
      barcodes: [
        {
          barcode: gtin,
          barcode_type: "GS1",
        },
      ],
      has_batch_no: 1,
    });

    // Show helpful message
    this.show_alert(`Creating new Item with barcode: ${gtin}`, "blue", 5);
  }

  gs1_api_call(gs1_data, callback) {
    frappe
      .call({
        method: this.gs1_parser_api,
        args: {
          gtin: gs1_data.gtin,
          lot: gs1_data.lot,
          expiry: gs1_data.expiry,
        },
      })
      .then((r) => {
        if (r && r.message && r.message.found_item) {
          r.message.item_code = r.message.found_item;
          r.message.batch_no = r.message.batch;
          r.message.batch_expiry_date = r.message.batch_expiry_date;
        }
        callback(r);
      })
      .catch(() => {
        callback({
          message: {
            error:
              "GS1 API call failed. Please check connection or server logs.",
          },
        });
      });
  }

  scan_api_call(input, callback) {
    frappe
      .call({
        method: this.scan_api,
        args: {
          search_value: input,
          ctx: {
            set_warehouse: this.frm.doc.set_warehouse,
            company: this.frm.doc.company,
          },
        },
      })
      .then((r) => {
        callback(r);
      })
      .catch(() => {
        callback({
          message: {
            error:
              "Barcode API call failed. Please check connection or server logs.",
          },
        });
      });
  }

  update_table(data) {
    return new Promise((resolve, reject) => {
      let cur_grid = this.frm.fields_dict[this.items_table_name].grid;
      frappe.flags.trigger_from_barcode_scanner = true;

      const {
        item_code,
        barcode,
        batch_no,
        batch_expiry_date,
        serial_no,
        uom,
        default_warehouse,
      } = data;

      // Check for pending condition FIRST
      // Condition scans should ALWAYS create a new row
      const pendingCondition = window.surgishop.pendingCondition;
      const pendingConditionWarehouse =
        window.surgishop.pendingConditionWarehouse;
      if (pendingCondition) {
        window.surgishop.pendingCondition = null;
        // Note: pendingConditionWarehouse is cleared in set_condition after being applied
      }

      // Check if we're forcing a new row (or if condition is pending)
      let forceNewRow = window.surgishop.forceNewRow || !!pendingCondition;
      if (window.surgishop.forceNewRow) {
        window.surgishop.forceNewRow = false;
      }

      // Check if we should prompt for quantity
      const shouldPromptQty =
        window.surgishop.forcePromptQty || this.prompt_qty;
      if (window.surgishop.forcePromptQty) {
        window.surgishop.forcePromptQty = false;
      }

      let row = forceNewRow
        ? null
        : this.get_row_to_modify_on_scan(
            item_code,
            batch_no,
            uom,
            barcode,
            default_warehouse,
            pendingCondition
          );
      const is_new_row = row && row.item_code ? false : true;

      if (!row) {
        if (this.dont_allow_new_row && !forceNewRow) {
          this.show_alert(
            `Maximum quantity scanned for item ${item_code}.`,
            "red"
          );
          this.clean_up();
          reject();
          return;
        }

        row = frappe.model.add_child(
          this.frm.doc,
          cur_grid.doctype,
          this.items_table_name
        );
        this.frm.script_manager.trigger(
          `${this.items_table_name}_add`,
          row.doctype,
          row.name
        );
        cur_grid.refresh();
        this.frm.has_items = false;
      }

      if (this.is_duplicate_serial_no(row, serial_no)) {
        this.clean_up();
        reject();
        return;
      }

      // Longer delay for new rows to ensure DOM is fully rendered
      const initialDelay = is_new_row ? 500 : 100;

      frappe.run_serially([
        () => this.set_selector_trigger_flag(data),
        () => new Promise((resolve) => setTimeout(resolve, initialDelay)),
        () =>
          this.set_item(
            row,
            item_code,
            barcode,
            batch_no,
            serial_no,
            shouldPromptQty
          ).then((qty) => {
            this.show_scan_message(row.idx, !is_new_row, qty);
          }),
        () => this.set_barcode_uom(row, uom),
        () => this.set_serial_no(row, serial_no),
        () => this.set_batch_no(row, batch_no),
        () => this.set_batch_expiry_date(row, batch_expiry_date),
        () => this.set_barcode(row, barcode),
        () => this.set_warehouse(row),
        () => this.set_condition(row, pendingCondition),
        () => this.clean_up(),
        () => this.revert_selector_flag(),
        () => resolve(row),
      ]);
    });
  }

  set_selector_trigger_flag(data) {
    const settings = window.surgishop.settings;

    // If globally disabled, always hide the dialog
    if (settings.disableSerialBatchSelector) {
      frappe.flags.hide_serial_batch_dialog = true;
      return;
    }

    const { batch_no, serial_no, has_batch_no, has_serial_no } = data;
    const require_selecting_batch = has_batch_no && !batch_no;
    const require_selecting_serial = has_serial_no && !serial_no;

    if (!(require_selecting_batch || require_selecting_serial)) {
      frappe.flags.hide_serial_batch_dialog = true;
    }
  }

  revert_selector_flag() {
    frappe.flags.hide_serial_batch_dialog = false;
    frappe.flags.trigger_from_barcode_scanner = false;
  }

  set_item(
    row,
    item_code,
    barcode,
    batch_no,
    serial_no,
    shouldPromptQty = false
  ) {
    return new Promise((resolve) => {
      const increment = async (value) => {
        const qty = value !== undefined ? value : this.default_qty;
        const item_data = {
          item_code: item_code,
          use_serial_batch_fields: 1.0,
        };
        frappe.flags.trigger_from_barcode_scanner = true;
        item_data[this.qty_field] =
          Number(row[this.qty_field] || 0) + Number(qty);
        try {
          await frappe.model.set_value(row.doctype, row.name, item_data);
        } catch (e) {
          // ERPNext internal handlers may throw errors when refreshing fields
          // before DOM is ready - this is harmless
        }
        return qty;
      };

      if (shouldPromptQty) {
        frappe.prompt(
          {
            fieldtype: "Float",
            label: `Enter quantity for ${item_code}`,
            fieldname: "value",
            default: this.default_qty,
            reqd: 1,
          },
          ({ value }) => {
            increment(value).then((qty) => resolve(qty));
          },
          "Enter Quantity",
          "Add"
        );
      } else if (this.frm.has_items) {
        this.prepare_item_for_scan(
          row,
          item_code,
          barcode,
          batch_no,
          serial_no
        );
        resolve(this.default_qty);
      } else {
        increment().then((qty) => resolve(qty));
      }
    });
  }

  prepare_item_for_scan(row, item_code, barcode, batch_no, serial_no) {
    return new Promise((resolve) => {
      const increment = async (value) => {
        const qty = value !== undefined ? value : this.default_qty;
        const item_data = {
          item_code: item_code,
          use_serial_batch_fields: 1.0,
        };
        frappe.flags.trigger_from_barcode_scanner = true;
        item_data[this.qty_field] =
          Number(row[this.qty_field] || 0) + Number(qty);
        try {
          await frappe.model.set_value(row.doctype, row.name, item_data);
        } catch (e) {
          // Safe to ignore
        }
        return qty;
      };

      increment().then((qty) => resolve(qty));
    });
  }

  async set_serial_no(row, serial_no) {
    if (serial_no && frappe.meta.has_field(row.doctype, this.serial_no_field)) {
      try {
        const existing_serial_nos = row[this.serial_no_field];
        let new_serial_nos = "";

        if (!!existing_serial_nos) {
          new_serial_nos = existing_serial_nos + "\n" + serial_no;
        } else {
          new_serial_nos = serial_no;
        }
        await frappe.model.set_value(
          row.doctype,
          row.name,
          this.serial_no_field,
          new_serial_nos
        );
      } catch (e) {
        // ERPNext internal refresh errors - safe to ignore
      }
    }
  }

  async set_barcode_uom(row, uom) {
    if (uom && frappe.meta.has_field(row.doctype, this.uom_field)) {
      try {
        await frappe.model.set_value(
          row.doctype,
          row.name,
          this.uom_field,
          uom
        );
      } catch (e) {
        // ERPNext internal refresh errors - safe to ignore
      }
    }
  }

  async set_batch_no(row, batch_no) {
    if (batch_no && frappe.meta.has_field(row.doctype, this.batch_no_field)) {
      try {
        await frappe.model.set_value(
          row.doctype,
          row.name,
          this.batch_no_field,
          batch_no
        );
      } catch (e) {
        // ERPNext internal refresh errors - safe to ignore
      }
    }
  }

  async set_batch_expiry_date(row, batch_expiry_date) {
    if (
      batch_expiry_date &&
      frappe.meta.has_field(row.doctype, this.batch_expiry_date_field)
    ) {
      try {
        await frappe.model.set_value(
          row.doctype,
          row.name,
          this.batch_expiry_date_field,
          batch_expiry_date
        );
      } catch (e) {
        // ERPNext internal refresh errors - safe to ignore
      }
    }
  }

  async set_barcode(row, barcode) {
    if (barcode && frappe.meta.has_field(row.doctype, this.barcode_field)) {
      try {
        await frappe.model.set_value(
          row.doctype,
          row.name,
          this.barcode_field,
          barcode
        );
      } catch (e) {
        // ERPNext internal refresh errors - safe to ignore
      }
    }
  }

  async set_warehouse(row) {
    if (!this.has_last_scanned_warehouse) return;

    const last_scanned_warehouse = this.frm.doc.last_scanned_warehouse;
    if (!last_scanned_warehouse) return;

    const warehouse_field = this.get_warehouse_field();
    if (
      !warehouse_field ||
      !frappe.meta.has_field(row.doctype, warehouse_field)
    )
      return;

    try {
      await frappe.model.set_value(
        row.doctype,
        row.name,
        warehouse_field,
        last_scanned_warehouse
      );
    } catch (e) {
      // ERPNext internal refresh errors - safe to ignore
    }
  }

  async set_condition(row, condition) {
    if (!condition) return;

    if (frappe.meta.has_field(row.doctype, this.condition_field)) {
      try {
        await frappe.model.set_value(
          row.doctype,
          row.name,
          this.condition_field,
          condition
        );
      } catch (e) {
        // ERPNext internal refresh errors - safe to ignore
      }
    }

    // Apply condition warehouse - use dialog selection if available, else fall back to settings
    const settings = window.surgishop.settings;
    const warehouse_field = this.get_warehouse_field();

    // Check for user selection from dialog first
    const dialogWarehouse = window.surgishop.pendingConditionWarehouse;
    let targetWarehouse = null;

    if (dialogWarehouse && dialogWarehouse !== "none") {
      // User made explicit selection in dialog
      if (dialogWarehouse === "accepted" && settings.acceptedWarehouse) {
        targetWarehouse = settings.acceptedWarehouse;
      } else if (dialogWarehouse === "rejected" && settings.rejectedWarehouse) {
        targetWarehouse = settings.rejectedWarehouse;
      }
    } else if (!dialogWarehouse) {
      // No dialog selection - fall back to default behavior from settings
      const behavior = settings.conditionWarehouseBehavior;
      if (behavior === "Use Accepted Warehouse" && settings.acceptedWarehouse) {
        targetWarehouse = settings.acceptedWarehouse;
      } else if (
        behavior === "Use Rejected Warehouse" &&
        settings.rejectedWarehouse
      ) {
        targetWarehouse = settings.rejectedWarehouse;
      }
    }
    // If dialogWarehouse === "none", user explicitly chose default - no warehouse override

    // Clear the pending warehouse selection
    window.surgishop.pendingConditionWarehouse = null;

    if (
      targetWarehouse &&
      warehouse_field &&
      frappe.meta.has_field(row.doctype, warehouse_field)
    ) {
      try {
        await frappe.model.set_value(
          row.doctype,
          row.name,
          warehouse_field,
          targetWarehouse
        );
      } catch (e) {
        // ERPNext internal refresh errors - safe to ignore
      }
    }
  }

  get_warehouse_field() {
    if (typeof this.warehouse_field === "function") {
      return this.warehouse_field(this.frm.doc);
    }
    return this.warehouse_field;
  }

  show_scan_message(idx, is_existing_row = false, qty = 1) {
    if (is_existing_row) {
      this.show_alert(`Row #${idx}: Qty increased by ${qty}`, "green");
    } else {
      const current_warehouse = this.frm.doc.last_scanned_warehouse;
      const warehouse_msg = current_warehouse ? ` in ${current_warehouse}` : "";
      this.show_alert(`Row #${idx}: Item added${warehouse_msg}`, "green");
    }
  }

  is_duplicate_serial_no(row, serial_no) {
    if (
      row &&
      row[this.serial_no_field] &&
      row[this.serial_no_field].includes(serial_no)
    ) {
      this.show_alert(`Serial No ${serial_no} is already added`, "orange");
      return true;
    }
    return false;
  }

  get_row_to_modify_on_scan(
    item_code,
    batch_no,
    uom,
    barcode,
    default_warehouse,
    pendingCondition = null
  ) {
    let cur_grid = this.frm.fields_dict[this.items_table_name].grid;

    let is_batch_no_scan =
      batch_no && frappe.meta.has_field(cur_grid.doctype, this.batch_no_field);
    let check_max_qty =
      this.max_qty_field &&
      frappe.meta.has_field(cur_grid.doctype, this.max_qty_field);

    const warehouse_field = this.get_warehouse_field();
    const has_warehouse_field =
      warehouse_field &&
      frappe.meta.has_field(cur_grid.doctype, warehouse_field);

    const warehouse = has_warehouse_field
      ? this.frm.doc.last_scanned_warehouse ||
        this.frm.doc.set_warehouse ||
        default_warehouse
      : null;

    // Check if condition field exists on the child doctype
    const has_condition_field = frappe.meta.has_field(
      cur_grid.doctype,
      this.condition_field
    );

    const matching_row = (row) => {
      const item_match = row.item_code == item_code;

      // For batch matching
      const row_batch = row[this.batch_no_field] || "";
      const scan_batch = batch_no || "";
      let batch_match = true;
      if (is_batch_no_scan) {
        batch_match = !row_batch || row_batch === scan_batch;
      }

      const uom_match = !uom || row[this.uom_field] == uom;

      const max_qty = flt(row[this.max_qty_field]);
      const qty_in_limit =
        max_qty > 0 ? flt(row[this.qty_field]) < max_qty : true;

      let warehouse_match = true;
      if (has_warehouse_field && warehouse_field) {
        const current_warehouse = warehouse || null;
        const existing_warehouse = row[warehouse_field] || null;

        if (current_warehouse && existing_warehouse) {
          warehouse_match = current_warehouse === existing_warehouse;
        } else {
          warehouse_match = true;
        }
      }

      // Condition matching:
      // - Normal scan (no condition) should NOT match rows that have a condition
      // - Condition scan should only match rows with the SAME condition
      let condition_match = true;
      if (has_condition_field) {
        const row_condition = row[this.condition_field] || "";
        const scan_condition = pendingCondition || "";

        if (scan_condition) {
          condition_match = row_condition === scan_condition;
        } else {
          condition_match = !row_condition;
        }
      }

      const matches =
        item_match &&
        uom_match &&
        warehouse_match &&
        batch_match &&
        condition_match &&
        (!check_max_qty || qty_in_limit);

      return matches;
    };

    const items_table = this.frm.doc[this.items_table_name] || [];
    return (
      items_table.find(matching_row) || items_table.find((d) => !d.item_code)
    );
  }

  play_success_sound() {
    if (this.enable_sounds && this.success_sound) {
      frappe.utils.play_sound(this.success_sound);
    }
  }

  play_fail_sound() {
    if (this.enable_sounds && this.fail_sound) {
      frappe.utils.play_sound(this.fail_sound);
    }
  }

  clean_up() {
    this.scan_barcode_field.set_value("");
    refresh_field(this.items_table_name);
  }

  show_alert(msg, indicator, duration = 3) {
    frappe.show_alert(
      {
        message: msg,
        indicator: indicator,
      },
      duration
    );
  }
};

/**
 * Load all scanner settings from SurgiShop Settings
 */
function loadSurgiShopScannerSettings() {
  frappe.call({
    method: "frappe.client.get_value",
    args: {
      doctype: "SurgiShop Settings",
      fieldname: [
        "enable_scan_sounds",
        "prompt_for_quantity",
        "default_scan_quantity",
        "auto_create_batches",
        "disable_serial_batch_selector",
        "new_line_trigger_barcode",
        "condition_trigger_barcode",
        "quantity_trigger_barcode",
        "delete_row_trigger_barcode",
        "warn_on_expiry_mismatch",
        "update_missing_expiry",
        "strict_gtin_validation",
        "prompt_create_item_on_unknown_gtin",
        "create_item_inline",
        "condition_warehouse_behavior",
        "accepted_warehouse",
        "rejected_warehouse",
      ],
    },
    async: true,
    callback: (r) => {
      if (r && r.message) {
        const s = r.message;
        window.surgishop.settings = {
          enableScanSounds: s.enable_scan_sounds !== 0,
          promptForQuantity: s.prompt_for_quantity === 1,
          defaultScanQuantity: s.default_scan_quantity || 1,
          autoCreateBatches: s.auto_create_batches !== 0,
          disableSerialBatchSelector: s.disable_serial_batch_selector !== 0,
          newLineTriggerBarcode: s.new_line_trigger_barcode || null,
          conditionTriggerBarcode: s.condition_trigger_barcode || null,
          quantityTriggerBarcode: s.quantity_trigger_barcode || null,
          deleteRowTriggerBarcode: s.delete_row_trigger_barcode || null,
          warnOnExpiryMismatch: s.warn_on_expiry_mismatch !== 0,
          updateMissingExpiry: s.update_missing_expiry !== 0,
          strictGtinValidation: s.strict_gtin_validation === 1,
          promptCreateItemOnUnknownGtin:
            s.prompt_create_item_on_unknown_gtin !== 0,
          createItemInline: s.create_item_inline !== 0,
          conditionWarehouseBehavior:
            s.condition_warehouse_behavior || "No Change",
          acceptedWarehouse: s.accepted_warehouse || null,
          rejectedWarehouse: s.rejected_warehouse || null,
        };

        // Apply global flag to disable serial/batch selector
        if (window.surgishop.settings.disableSerialBatchSelector) {
          frappe.flags.hide_serial_batch_dialog = true;
        }
      }
    },
  });
}

// Roles that are allowed to use the scanner
const SCANNER_ALLOWED_ROLES = [
  "System Manager",
  "Stock Manager",
  "Stock User",
  "Purchase Manager",
  "Purchase User",
];

/**
 * Check if current user has permission to use the scanner
 */
function userCanUseScanner() {
  if (!frappe.user || !frappe.user.has_role) {
    return false;
  }
  return SCANNER_ALLOWED_ROLES.some((role) => frappe.user.has_role(role));
}

// Load settings on page load (only for authorized users)
$(document).ready(() => {
  if (!userCanUseScanner()) {
    return; // Don't initialize scanner for users without appropriate roles
  }
  loadSurgiShopScannerSettings();
});

/**
 * This is the main override logic.
 * We wrap this in a router 'change' event to ensure the Frappe framework is fully
 * loaded and ready before we try to attach our form-specific hooks.
 */
frappe.router.on("change", () => {
  // Skip scanner initialization for users without appropriate roles
  if (!userCanUseScanner()) {
    return;
  }
  const doctypes_to_override = [
    "Stock Entry",
    "Purchase Order",
    "Purchase Receipt",
    "Purchase Invoice",
    "Sales Invoice",
    "Delivery Note",
    "Stock Reconciliation",
  ];

  if (
    frappe.get_route() &&
    frappe.get_route()[0] === "Form" &&
    doctypes_to_override.includes(frappe.get_route()[1])
  ) {
    const frm = cur_frm;
    if (frm && !frm.custom_scanner_attached) {
      frappe.ui.form.on(frappe.get_route()[1], {
        scan_barcode: function (frm) {
          const opts = frm.events.get_barcode_scanner_options
            ? frm.events.get_barcode_scanner_options(frm)
            : {};
          opts.frm = frm;

          const scanner = new surgishop.CustomBarcodeScanner(opts);
          scanner.process_scan().catch(() => {
            frappe.show_alert({
              message: "Barcode scan failed. Please try again.",
              indicator: "red",
            });
          });
        },
      });
      frm.custom_scanner_attached = true;
    }
  }
});

/**
 * Auto-fetch expiry date when batch_no is manually changed in child tables
 * This handles cases where users select a batch manually (not via scanner)
 */
function setupBatchExpiryAutoFetch() {
  const childDoctypes = [
    "Purchase Receipt Item",
    "Purchase Invoice Item",
    "Stock Entry Detail",
    "Delivery Note Item",
    "Sales Invoice Item",
  ];

  childDoctypes.forEach((childDoctype) => {
    frappe.ui.form.on(childDoctype, {
      batch_no: function (frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        const batchNo = row.batch_no;

        if (batchNo) {
          frappe.db.get_value("Batch", batchNo, "expiry_date", (r) => {
            if (r && r.expiry_date) {
              frappe.model.set_value(
                cdt,
                cdn,
                "custom_expiration_date",
                r.expiry_date
              );
            } else {
              frappe.model.set_value(cdt, cdn, "custom_expiration_date", null);
            }
          });
        } else {
          frappe.model.set_value(cdt, cdn, "custom_expiration_date", null);
        }
      },
    });
  });
}

// Initialize batch expiry auto-fetch on page ready
$(document).ready(() => {
  setupBatchExpiryAutoFetch();
});
