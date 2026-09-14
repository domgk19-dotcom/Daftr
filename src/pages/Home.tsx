import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpLeft, BarChart3, Bell, BookOpen, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, Clock3, Download, FileBarChart, FileText, Filter, LayoutDashboard, Menu, MoreHorizontal, Pencil, Plus, RefreshCcw, Search, Share2, Settings, SlidersHorizontal, Sparkles, Trash2, TrendingUp, UserRound, UsersRound, WalletCards, ShieldCheck, ShieldAlert, KeyRound, Copy, X } from "lucide-react";
import { createEmptyDatabase, insertSalesVoucher, insertPurchaseVoucher, saveShopSettings, deleteCustomer, deleteCurrency, deleteTransaction, exportDatabase, importDatabase, insertCurrency, insertCustomer, insertTransaction, readAccountingData, updateCurrency, updateCustomer, updateTransaction, type DbCatalogItem, type DbCustomer, type DbCurrency, type DbShopSettings, type DbTransaction } from "../lib/accountingDb";
import { LicenseService, type LicenseInfo } from "../lib/licenseService";
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

type Customer = DbCustomer;
type Transaction = DbTransaction;

const navItems = [
  { id: "overview", label: "نظرة عامة", icon: LayoutDashboard },
  { id: "accounts", label: "العملاء / الموردين", icon: UsersRound },
  { id: "transactions", label: "سجل العمليات", icon: ArrowDownLeft },
  { id: "sales-vouchers", label: "سندات المبيعات", icon: FileText },
  { id: "purchase-vouchers", label: "سندات المشتريات", icon: FileText },
  { id: "currencies", label: "العملات", icon: CircleDollarSign },
  { id: "reports", label: "التقارير", icon: FileBarChart },
  { id: "analytics", label: "ذكاء الأعمال", icon: Sparkles },
];

const formatMoney = (value: number, currency?: Pick<DbCurrency, "symbol" | "code">) => `${Math.abs(value).toLocaleString("en-US")} ${currency?.symbol || currency?.code || ""}`.trim();

const transactionDateKey = (value: string) => {
  if (value.includes("اليوم")) return new Date().toISOString().slice(0, 10);
  if (value.includes("أمس")) {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return date.toISOString().slice(0, 10);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? (value.includes("مايو") ? `${new Date().getFullYear()}-09-01` : "") : parsed.toISOString().slice(0, 10);
};

function StatCard({ label, value, hint, icon: Icon, accent, trend }: { label: string; value: string; hint: string; icon: typeof WalletCards; accent: string; trend?: string }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${accent}`}><Icon size={21} strokeWidth={1.8} /></div>
      <div className="stat-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{trend && <b className="positive">{trend}</b>} {hint}</small>
      </div>
      <button className="icon-button stat-more" aria-label="المزيد"><MoreHorizontal size={18} /></button>
    </div>
  );
}

function Avatar({ customer, size = "md" }: { customer: Pick<Customer, "initials" | "tone">; size?: "sm" | "md" | "lg" }) {
  return <div className={`avatar avatar-${size} avatar-${customer.tone}`}>{customer.initials}</div>;
}

function EmptyState({ title, description, onAdd }: { title: string; description: string; onAdd: () => void }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><BookOpen size={28} /></div>
      <h3>{title}</h3>
      <p>{description}</p>
      <button className="primary-button" onClick={onAdd}><Plus size={17} /> إضافة جديد</button>
    </div>
  );
}

export default function Home() {
  const [activeView, setActiveView] = useState("overview");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [currencies, setCurrencies] = useState<DbCurrency[]>([]);
  const [catalogItems, setCatalogItems] = useState<DbCatalogItem[]>([]);
  const [catalogUnits, setCatalogUnits] = useState<DbCatalogItem[]>([]);
  const [shopSettings, setShopSettings] = useState<DbShopSettings>({ id: 1, name: "اسم المحل", phone: "", logo: "", country: "اليمن", countryCode: "+967", defaultCurrencyId: 1 });
  const [voucherType, setVoucherType] = useState<"sales" | "purchase">("sales");
  const [showSalesVoucher, setShowSalesVoucher] = useState(false);
  const [salesRows, setSalesRows] = useState<{ item: string; quantity: number; unit: string; amount: number }[]>([]);
  const [voucherDraft, setVoucherDraft] = useState({ item: "", quantity: "", unit: "", amount: "" });
  const [itemFocused, setItemFocused] = useState(false);
  const [unitFocused, setUnitFocused] = useState(false);
  const [selectedCurrencyId, setSelectedCurrencyId] = useState(1);
  const [transactionPeriod, setTransactionPeriod] = useState<"all" | "today" | "month" | "date">("all");
  const [selectedDate, setSelectedDate] = useState("");
  const [reportCustomerId, setReportCustomerId] = useState<number | null>(null);
  const [reportCustomerQuery, setReportCustomerQuery] = useState("");
  const [reportCurrencyId, setReportCurrencyId] = useState<number | "all">("all");
  const [reportPeriod, setReportPeriod] = useState<"all" | "date" | "range">("all");
  const [reportFromDate, setReportFromDate] = useState("");
  const [reportToDate, setReportToDate] = useState("");
  const [reportMode, setReportMode] = useState<"detail" | "summary">("detail");
  const [reportRequested, setReportRequested] = useState(false);
  const [showCurrency, setShowCurrency] = useState(false);
  const [editingCurrency, setEditingCurrency] = useState<DbCurrency | null>(null);
  const [databaseReady, setDatabaseReady] = useState(false);
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showTransaction, setShowTransaction] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [statementCustomer, setStatementCustomer] = useState<Customer | null>(null);
  const [backupFolder, setBackupFolder] = useState<string>(() => localStorage.getItem("daftar-backup-folder") || "");
  const [backupDirectory, setBackupDirectory] = useState<any>(null);
  const [backupFrequency, setBackupFrequency] = useState<"daily" | "hourly">(() => localStorage.getItem("daftar-backup-frequency") === "hourly" ? "hourly" : "daily");
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo>(() => LicenseService.checkStatus());
  const [licenseKey, setLicenseKey] = useState("");
  const [licenseClientName, setLicenseClientName] = useState("");
  const [licenseMessage, setLicenseMessage] = useState("");
  const reportRef = useRef<HTMLElement>(null);

  useEffect(() => {
    readAccountingData().then((data) => {
      const { customers: loadedCustomers, transactions: loadedTransactions, currencies: loadedCurrencies } = data;
      setCustomers(loadedCustomers);
      setTransactions(loadedTransactions);
      setCurrencies(loadedCurrencies);
      setCatalogItems(data.items || []);
      setCatalogUnits(data.units || []);
      if (data.shop) setShopSettings(data.shop);
      setSelectedCurrencyId(data.shop?.defaultCurrencyId || loadedCurrencies[0]?.id || 1);
      setReportCustomerId((current) => current ?? loadedCustomers[0]?.id ?? null);
      setDatabaseReady(true);
    }).catch(() => setToast("خطأ في تحميل قاعدة البيانات"));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setLicenseInfo(LicenseService.checkStatus()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredCustomers = useMemo(() => customers.filter((customer) => `${customer.name} ${customer.phone} ${customer.group}`.toLowerCase().includes(query.toLowerCase())), [customers, query]);
  const overviewCurrency = currencies.find((currency) => currency.id === selectedCurrencyId) || currencies[0];
  const overviewTransactions = useMemo(() => transactions.filter((transaction) => transaction.currencyId === overviewCurrency?.id), [transactions, overviewCurrency]);

  const totals = useMemo(() => {
    const month = new Date().toISOString().slice(0, 7);
    return {
      receivables: overviewTransactions.filter((transaction) => transaction.type === "صرف").reduce((sum, transaction) => sum + transaction.amount, 0),
      payables: overviewTransactions.filter((transaction) => transaction.type === "قبض").reduce((sum, transaction) => sum + transaction.amount, 0),
      monthTransactions: overviewTransactions.filter((transaction) => transactionDateKey(transaction.date).slice(0, 7) === month).length,
      customers: customers.length
    };
  }, [customers.length, overviewTransactions]);

  const currencyFor = (id: number) => currencies.find((currency) => currency.id === id);

  const monthlyChart = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const rows = overviewTransactions.filter((transaction) => transactionDateKey(transaction.date).slice(0, 7) === key);
      return {
        label: new Intl.DateTimeFormat("ar-IQ", { month: "short" }).format(date),
        income: rows.filter((transaction) => transaction.type === "قبض").reduce((sum, transaction) => sum + transaction.amount, 0),
        expense: rows.filter((transaction) => transaction.type === "صرف").reduce((sum, transaction) => sum + transaction.amount, 0)
      };
    });
  }, [overviewTransactions]);

  const chartMax = Math.max(1, ...monthlyChart.flatMap((item) => [item.income, item.expense]));

  const analyticsData = useMemo(() => {
    const targetCurrency = selectedCurrencyId || currencies[0]?.id || 1;
    const currencyInfo = currencies.find(c => c.id === targetCurrency);
    const relevantTxs = transactions.filter(t => t.currencyId === targetCurrency);
    
    // Group by month for the last 6 months
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });

    const flowData = months.map(month => {
      const monthTxs = relevantTxs.filter(t => t.date.startsWith(month));
      const income = monthTxs.filter(t => t.type === "قبض").reduce((sum, t) => sum + t.amount, 0);
      const expense = monthTxs.filter(t => t.type === "صرف").reduce((sum, t) => sum + t.amount, 0);
      return { 
        date: new Intl.DateTimeFormat("ar-IQ", { month: "short" }).format(new Date(`${month}-01`)), 
        income, 
        expense, 
        label: month 
      };
    });

    const incomeTotal = relevantTxs.filter(t => t.type === "قبض").reduce((sum, t) => sum + t.amount, 0);
    const expenseTotal = relevantTxs.filter(t => t.type === "صرف").reduce((sum, t) => sum + t.amount, 0);

    // Summary for all currencies
    const summaries = currencies.map(currency => {
      const currTxs = transactions.filter(t => t.currencyId === currency.id);
      const totalIn = currTxs.filter(t => t.type === "قبض").reduce((sum, t) => sum + t.amount, 0);
      const totalOut = currTxs.filter(t => t.type === "صرف").reduce((sum, t) => sum + t.amount, 0);
      return { currency, totalIn, totalOut, net: totalIn - totalOut };
    });

    return { flowData, currency: currencyInfo, incomeTotal, expenseTotal, summaries };
  }, [transactions, selectedCurrencyId, currencies]);

  const saveShop = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    saveShopSettings({
      name: String(form.get("shop-name") || "اسم المحل"),
      phone: String(form.get("shop-phone") || ""),
      logo: String(form.get("shop-logo") || ""),
      country: String(form.get("shop-country") || "اليمن"),
      countryCode: String(form.get("shop-country-code") || ({ "اليمن": "+967", "العراق": "+964", "السعودية": "+966", "الأردن": "+962", "الإمارات": "+971", "الكويت": "+965", "قطر": "+974", "عمان": "+968", "البحرين": "+973", "مصر": "+20" } as Record<string, string>)[String(form.get("shop-country") || "اليمن")] || "+967"),
      defaultCurrencyId: Number(form.get("shop-currency") || 1)
    }).then((data) => {
      refreshData(data, "تم تحديث الإعدادات بنجاح");
      setShopSettings(data.shop || shopSettings);
      setSelectedCurrencyId(Number(form.get("shop-currency") || 1));
    }).catch((error: Error) => setToast(error.message));
  };

  const insertVoucherRow = () => {
    const item = voucherDraft.item.trim();
    const unit = voucherDraft.unit.trim();
    const quantity = Number(voucherDraft.quantity);
    const amount = Number(voucherDraft.amount);
    if (!item || !unit || !quantity || !amount) {
      setToast("يرجى إكمال جميع الحقول");
      return;
    }
    setSalesRows((rows) => [...rows, { item, quantity, unit, amount }]);
    setVoucherDraft({ item: "", quantity: "", unit: "", amount: "" });
    setToast("تمت الإضافة");
  };

  const addSalesVoucher = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const customerName = String(form.get("customer") || "");
    const handover = String(form.get("handover") || "");
    if (!customerName) { setToast("اختر العميل"); return; }
    if (!salesRows.length) { setToast("لا توجد أصناف في الفاتورة"); return; }
    const payload = { customerName, currencyId: Number(form.get("currency") || selectedCurrencyId), date: String(form.get("date") || ""), handover, rows: salesRows };
    (voucherType === "sales" ? insertSalesVoucher(payload) : insertPurchaseVoucher(payload)).then((data) => {
      refreshData(data, voucherType === "sales" ? "تم حفظ الفاتورة بنجاح" : "تم حفظ سند المشتريات");
      setShowSalesVoucher(false);
      setSalesRows([]);
      setVoucherDraft({ item: "", quantity: "", unit: "", amount: "" });
    }).catch((error: Error) => setToast(error.message));
  };

  const saveReportPdf = async (action: 'save' | 'share' = 'save') => {
    if (!reportRef.current) return;
    let clone: HTMLElement | null = null;
    try {
      setToast(action === 'share' ? "جاري تجهيز التقرير للمشاركة..." : "جاري حفظ التقرير...");
      const docElement = reportRef.current.querySelector(".report-document");
      if (!docElement) throw new Error("التقرير غير موجود");
      
      clone = docElement.cloneNode(true) as HTMLElement;
      clone.classList.add("pdf-export-mode");
      clone.style.display = "block";
      clone.style.width = "794px";
      clone.style.maxWidth = "794px";
      clone.style.background = "#ffffff";
      clone.style.padding = "40px";
      clone.style.margin = "0";
      clone.style.position = "absolute";
      clone.style.left = "-10000px";
      clone.style.top = "0";
      document.body.appendChild(clone);
      
      const canvas = await html2canvas(clone, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
      const pageWidth = 190;
      const pageHeight = 277;
      const pageHeightPx = Math.floor(canvas.width * pageHeight / pageWidth);
      for (let y = 0, page = 0; y < canvas.height; y += pageHeightPx, page += 1) {
        const sliceHeight = Math.min(pageHeightPx, canvas.height - y);
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeight;
        pageCanvas.getContext("2d")?.drawImage(canvas, 0, y, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
        if (page > 0) pdf.addPage();
        pdf.addImage(pageCanvas.toDataURL("image/jpeg", 0.92), "JPEG", 10, 10, pageWidth, sliceHeight * pageWidth / canvas.width);
      }
      const fileName = `تقرير-${new Date().toISOString().slice(0, 10)}.pdf`;
      
      if (Capacitor.isNativePlatform()) {
        await Filesystem.mkdir({ path: "mgk/PDF", directory: Directory.Documents, recursive: true }).catch(() => undefined);
        const uri = await Filesystem.writeFile({ path: `mgk/PDF/${fileName}`, data: pdf.output("datauristring").split(",")[1], directory: Directory.Documents, recursive: true });
        
        if (action === 'share') {
          await Share.share({ title: "تقرير حساب", files: [uri.uri], dialogTitle: "مشاركة التقرير" });
        } else {
          setToast("تم حفظ التقرير في مجلد Documents/mgk/PDF");
        }
      } else {
        if (action === 'share') {
          const blob = pdf.output("blob");
          const file = new File([blob], fileName, { type: "application/pdf" });
          if (navigator.share && navigator.canShare?.({ files: [file] })) {
            await navigator.share({ title: "تقرير حساب", files: [file] });
          } else {
            pdf.save(fileName);
            setToast("المتصفح لا يدعم المشاركة، تم التحميل بدلاً من ذلك");
          }
        } else {
          pdf.save(fileName);
          setToast("تم تحميل التقرير");
        }
      }
    } catch {
      setToast("فشل عملية التصدير");
    } finally {
      clone?.remove();
    }
  };

  const shareDatabase = async () => {
    try {
      const bytes = await exportDatabase();
      const fileName = `judaiei-soft-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`;
      if (Capacitor.isNativePlatform()) {
        await Filesystem.mkdir({ path: "mgk/Backups", directory: Directory.Documents, recursive: true }).catch(() => undefined);
        await Filesystem.writeFile({ path: `mgk/Backups/${fileName}`, data: bytesToBase64(bytes), directory: Directory.Documents, recursive: true });
        const uri = await Filesystem.getUri({ path: `mgk/Backups/${fileName}`, directory: Directory.Documents });
        await Share.share({ title: "النسخة الاحتياطية", text: "نسخة جديعي سوفت", files: [uri.uri], dialogTitle: "مشاركة النسخة" });
      } else {
        const file = new File([bytes], fileName, { type: "application/x-sqlite3" });
        if (navigator.share && navigator.canShare?.({ files: [file] })) await navigator.share({ title: "النسخة الاحتياطية", files: [file] });
        else downloadBackup();
      }
    } catch {
      setToast("فشل المشاركة");
    }
  };

  const shareCustomerReport = () => {
    if (!reportCustomer) { setToast("يرجى اختيار عميل أولاً"); return; }
    const digits = reportCustomer.phone.replace(/\D/g, "");
    const normalized = digits.startsWith("0") ? `${shopSettings.countryCode.replace("+", "")}${digits.slice(1)}` : digits;
    const message = `كشف حساب السيد/ة ${reportCustomer.name}\nمن: ${shopSettings.name}\nعدد الحركات: ${reportTransactions.length}`;
    window.open(`https://wa.me/${normalized}?text=${encodeURIComponent(message)}`, "_blank");
  };

  const addCustomer = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") || "").trim();
    if (!name) return;
    insertCustomer({ name, phone: String(data.get("phone") || ""), group: String(data.get("group") || "عملاء") }).then(({ customers: loadedCustomers, transactions: loadedTransactions, currencies: loadedCurrencies }) => {
      setCustomers(loadedCustomers);
      setTransactions(loadedTransactions);
      setCurrencies(loadedCurrencies);
      setShowAdd(false);
      setToast("تم الحفظ بنجاح");
    });
  };

  const addTransaction = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const customerName = String(data.get("customer") || "");
    const amount = Number(data.get("amount") || 0);
    const type = String(data.get("type") || "قبض") as "قبض" | "صرف";
    const handover = String(data.get("handover") || "").trim();
    if (!customerName || !amount) return;
    insertTransaction({ customerName, currencyId: Number(data.get("currency") || 1), type, amount, note: String(data.get("note") || ""), date: String(data.get("date") || new Date().toISOString().slice(0, 10)), handover }).then(({ customers: loadedCustomers, transactions: loadedTransactions, currencies: loadedCurrencies }) => {
      setCustomers(loadedCustomers);
      setTransactions(loadedTransactions);
      setCurrencies(loadedCurrencies);
      setShowTransaction(false);
      setToast("تمت الإضافة بنجاح");
    });
  };

  const refreshData = (data: { customers: Customer[]; transactions: Transaction[]; currencies: DbCurrency[]; items?: DbCatalogItem[]; units?: DbCatalogItem[]; shop?: DbShopSettings | null }, message: string) => {
    setCustomers(data.customers);
    setTransactions(data.transactions);
    setCurrencies(data.currencies);
    setCatalogItems(data.items || []);
    setCatalogUnits(data.units || []);
    if (data.shop) setShopSettings(data.shop);
    setToast(message);
  };

  const saveCustomerEdit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingCustomer) return;
    const form = new FormData(event.currentTarget);
    updateCustomer(editingCustomer.id, { name: String(form.get("name") || ""), phone: String(form.get("phone") || ""), group: String(form.get("group") || "") }).then((data) => {
      refreshData(data, "تم التعديل بنجاح");
      setEditingCustomer(null);
    }).catch((error: Error) => setToast(error.message));
  };

  const removeCustomer = (customer: Customer) => {
    if (customer.transactionCount > 0) { setToast("لا يمكن حذف عميل لديه حركات"); return; }
    if (!window.confirm(`تأكيد حذف ${customer.name}؟`)) return;
    deleteCustomer(customer.id).then((data) => {
      refreshData(data, "تم الحذف");
      setSelectedCustomer(null);
    }).catch((error: Error) => setToast(error.message));
  };

  const saveTransactionEdit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingTransaction) return;
    const form = new FormData(event.currentTarget);
    updateTransaction(editingTransaction.id, { currencyId: Number(form.get("currency") || 1), date: String(form.get("date") || editingTransaction.date), type: String(form.get("type")) as "قبض" | "صرف", amount: Number(form.get("amount") || 0), note: String(form.get("note") || ""), handover: String(form.get("handover") || "") }).then((data) => {
      refreshData(data, "تم التعديل");
      setEditingTransaction(null);
    }).catch((error: Error) => setToast(error.message));
  };

  const visibleTransactions = useMemo(() => transactions.filter((transaction) => {
    if (transaction.currencyId !== selectedCurrencyId) return false;
    if (transactionPeriod === "all") return true;
    const key = transactionDateKey(transaction.date);
    const today = new Date().toISOString().slice(0, 10);
    if (transactionPeriod === "today") return key === today;
    if (transactionPeriod === "month") return key.slice(0, 7) === today.slice(0, 7);
    return key === selectedDate;
  }).sort((a, b) => b.id - a.id), [transactions, selectedCurrencyId, transactionPeriod, selectedDate]);

  const reportCustomer = customers.find((customer) => customer.id === reportCustomerId) || null;
  const reportCustomerOptions = customers.filter((customer) => `${customer.name} ${customer.phone}`.toLowerCase().includes(reportCustomerQuery.toLowerCase()));

  const reportTransactions = useMemo(() => {
    if (!reportCustomer) return [];
    return transactions.filter((transaction) => transaction.customer === reportCustomer.name && (reportCurrencyId === "all" || transaction.currencyId === reportCurrencyId) && (() => {
      const key = transactionDateKey(transaction.date);
      if (reportPeriod === "all") return true;
      if (reportPeriod === "date") return key === reportFromDate;
      return (!reportFromDate || key >= reportFromDate) && (!reportToDate || key <= reportToDate);
    })()).sort((a, b) => b.id - a.id);
  }, [transactions, reportCustomer, reportCurrencyId, reportPeriod, reportFromDate, reportToDate]);

  const reportCurrencies = reportCurrencyId === "all" ? currencies : currencies.filter((currency) => currency.id === reportCurrencyId);

  const reportRowsByCurrency = reportCurrencies.map((currency) => ({
    currency,
    rows: reportTransactions.filter((transaction) => transaction.currencyId === currency.id),
    totalIn: reportTransactions.filter((transaction) => transaction.currencyId === currency.id && transaction.type === "قبض").reduce((sum, transaction) => sum + transaction.amount, 0),
    totalOut: reportTransactions.filter((transaction) => transaction.currencyId === currency.id && transaction.type === "صرف").reduce((sum, transaction) => sum + transaction.amount, 0)
  }));

  const globalReportTransactions = useMemo(() => transactions.filter((transaction) => (reportCurrencyId === "all" || transaction.currencyId === reportCurrencyId) && (() => {
    const key = transactionDateKey(transaction.date);
    if (reportPeriod === "all") return true;
    if (reportPeriod === "date") return key === reportFromDate;
    return (!reportFromDate || key >= reportFromDate) && (!reportToDate || key <= reportToDate);
  })()).sort((a, b) => b.id - a.id), [transactions, reportCurrencyId, reportPeriod, reportFromDate, reportToDate]);

  const globalCurrencyTotals = currencies.filter((currency) => reportCurrencyId === "all" || currency.id === reportCurrencyId).map((currency) => {
    const rows = globalReportTransactions.filter((transaction) => transaction.currencyId === currency.id);
    const credit = rows.filter((transaction) => transaction.type === "صرف").reduce((sum, transaction) => sum + transaction.amount, 0);
    const debit = rows.filter((transaction) => transaction.type === "قبض").reduce((sum, transaction) => sum + transaction.amount, 0);
    return { currency, credit, debit, net: credit - debit };
  });

  const addCurrency = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    insertCurrency({ name: String(form.get("name") || ""), code: String(form.get("code") || ""), symbol: String(form.get("symbol") || ""), decimals: Number(form.get("decimals") || 2) }).then((data) => {
      refreshData(data, "تم إضافة العملة");
      setShowCurrency(false);
    }).catch((error: Error) => setToast(error.message));
  };

  const saveCurrencyEdit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const id = Number(form.get("id"));
    updateCurrency(id, { name: String(form.get("name") || ""), code: String(form.get("code") || ""), symbol: String(form.get("symbol") || "") }).then((data) => refreshData(data, "تم التعديل")).catch((error: Error) => setToast(error.message));
  };

  const removeCurrency = (currency: DbCurrency) => {
    if (currency.transactionCount) { setToast("لا يمكن حذف عملة مستخدمة"); return; }
    if (currency.id === 1) { setToast("لا يمكن حذف العملة الأساسية"); return; }
    if (!window.confirm(`حذف عملة ${currency.name}؟`)) return;
    deleteCurrency(currency.id).then((data) => refreshData(data, "تم الحذف")).catch((error: Error) => setToast(error.message));
  };

  const removeTransaction = (transaction: Transaction) => {
    if (!window.confirm("تأكيد حذف هذه العملية؟")) return;
    deleteTransaction(transaction.id).then((data) => refreshData(data, "تم الحذف"));
  };

  const bytesToBase64 = (bytes: Uint8Array) => {
    let binary = "";
    const chunk = 0x8000;
    for (let index = 0; index < bytes.length; index += chunk) {
      const end = Math.min(index + chunk, bytes.length);
      for (let cursor = index; cursor < end; cursor += 1) binary += String.fromCharCode(bytes[cursor]);
    }
    return btoa(binary);
  };

  const writeBackupToDirectory = async (directory: any, notify = true) => {
    const bytes = await exportDatabase();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `daftar-backup-${stamp}.sqlite`;
    if (Capacitor.isNativePlatform()) {
      await Filesystem.mkdir({ path: "mgk/Backups", directory: Directory.Documents, recursive: true }).catch(() => undefined);
      await Filesystem.writeFile({ path: `mgk/Backups/${fileName}`, data: bytesToBase64(bytes), directory: Directory.Documents, recursive: true });
      const listing = await Filesystem.readdir({ path: "mgk/Backups", directory: Directory.Documents });
      const backups = listing.files.filter((file) => file.name.endsWith(".sqlite")).sort((a, b) => b.name.localeCompare(a.name));
      for (const oldFile of backups.slice(3)) await Filesystem.deleteFile({ path: `mgk/Backups/${oldFile.name}`, directory: Directory.Documents });
      if (notify) setToast("تم حفظ النسخة في Documents/mgk/Backups");
      return;
    }
    const file = await directory.getFileHandle(fileName, { create: true });
    const writable = await file.createWritable();
    await writable.write(bytes);
    await writable.close();
    const entries: { name: string; handle: any }[] = [];
    if (directory.values) for await (const handle of directory.values()) if (handle.kind === "file" && handle.name.endsWith(".sqlite")) entries.push({ name: handle.name, handle });
    entries.sort((a, b) => b.name.localeCompare(a.name));
    for (const entry of entries.slice(3)) await directory.removeEntry(entry.name);
    if (notify) setToast("تم حفظ النسخة التلقائية");
  };

  const chooseBackupFolder = async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        await Filesystem.mkdir({ path: "mgk/Backups", directory: Directory.Documents, recursive: true }).catch(() => undefined);
        setBackupDirectory({ native: true });
        setBackupFolder("Documents/mgk/Backups");
        localStorage.setItem("daftar-backup-folder", "Documents/mgk/Backups");
        await writeBackupToDirectory({ native: true });
      } catch {
        setToast("تعذر الوصول لمجلد المستندات");
      }
      return;
    }
    const picker = (window as Window & { showDirectoryPicker?: () => Promise<any> }).showDirectoryPicker;
    if (!picker) { setToast("المتصفح لا يدعم تحديد المجلدات"); return; }
    try {
      const folder = await picker();
      const mgk = await folder.getDirectoryHandle("mgk", { create: true });
      setBackupDirectory(mgk);
      setBackupFolder(`${folder.name}/mgk`);
      localStorage.setItem("daftar-backup-folder", `${folder.name}/mgk`);
      await writeBackupToDirectory(mgk);
    } catch {
      setToast("تم إلغاء التحديد");
    }
  };

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (backupDirectory) writeBackupToDirectory(backupDirectory, false);
    }, backupFrequency === "hourly" ? 3600000 : 86400000);
    return () => window.clearInterval(interval);
  }, [backupDirectory, backupFrequency]);

  const downloadBackup = async () => {
    const blob = new Blob([await exportDatabase()], { type: "application/x-sqlite3" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "daftar-backup.sqlite";
    link.click();
    URL.revokeObjectURL(link.href);
    setToast("تم تحميل النسخة");
  };

  const restoreBackup = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".sqlite,.db,.sqlite3";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const data = await importDatabase(new Uint8Array(await file.arrayBuffer()));
      refreshData(data, "تم استعادة البيانات");
    };
    input.click();
  };

  const createZeroDatabase = async () => {
    if (!window.confirm("تأكيد تصفير النظام! سيتم مسح كافة البيانات.")) return;
    const data = await createEmptyDatabase();
    refreshData(data, "تم تصفير قاعدة البيانات");
  };

  const handleNav = (id: string) => {
    setActiveView(id);
    setQuery("");
    setMenuOpen(false);
  };

  const title = activeView === "overview" ? "الرئيسية" : activeView === "transactions" ? `العمليات - ${currencies.find((currency) => currency.id === selectedCurrencyId)?.name || "العملة"}` : activeView === "license" ? "الترخيص" : navItems.find((item) => item.id === activeView)?.label || (activeView === "backup" ? "النسخ الاحتياطي" : "الإعدادات");

  return (
    <div className={`app-shell ${activeView === "overview" ? "overview-active" : ""}`} dir="rtl">
      {!databaseReady && <div className="db-loading"><span className="loading-spinner" /> جاري التحميل...</div>}
      {licenseInfo.isExpired && activeView !== "license" && (
        <div className="license-lock-screen">
          <div className="license-lock-card">
            <div className="license-lock-icon"><ShieldAlert size={34} /></div>
            <span className="license-kicker">تنبيه النظام</span>
            <h1>النسخة غير مرخصة</h1>
            <p>{licenseInfo.clockTampered ? "تم اكتشاف تلاعب في وقت النظام." : "لقد انتهت فترة صلاحية الترخيص الخاص بك."}</p>
            <div className="lock-rules">
              <span><Check size={15} /> جميع بياناتك محفوظة وآمنة</span>
              <span><Check size={15} /> لا يمكن إضافة بيانات جديدة حالياً</span>
              <span><Check size={15} /> يرجى تفعيل النسخة للمتابعة</span>
            </div>
            <button className="primary-button" onClick={() => setActiveView("license")}><KeyRound size={17} /> إدخال مفتاح التفعيل</button>
          </div>
        </div>
      )}

      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}
      <aside className={`sidebar ${menuOpen ? "is-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><img src="/icon.jpg" alt="Logo" style={{ width: 22, height: 22, borderRadius: 4 }} /></div>
          <div><strong>جديعي سوفت</strong><span>نظام مالي مبسط</span></div>
          <button className="sidebar-close icon-button" onClick={() => setMenuOpen(false)}><X size={19} /></button>
        </div>
        <div className="workspace-switcher">
          <div><b>{shopSettings.name}</b><span>{shopSettings.phone || "بدون رقم"}</span></div>
          <ChevronDown size={16} />
        </div>
        <nav className="main-nav">
          <p className="nav-label">القائمة الرئيسية</p>
          {navItems.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-item ${activeView === id ? "active" : ""}`} onClick={() => handleNav(id)}>
              <Icon size={19} /><span>{label}</span>
              {id === "accounts" && <em>{customers.length.toLocaleString("en-US")}</em>}
            </button>
          ))}
          <p className="nav-label nav-label-spaced">النظام</p>
          <button className={`nav-item ${activeView === "backup" ? "active" : ""}`} onClick={() => handleNav("backup")}><Download size={19} /><span>النسخ الاحتياطي</span></button>
          <button className={`nav-item ${activeView === "settings" ? "active" : ""}`} onClick={() => handleNav("settings")}><Settings size={19} /><span>الإعدادات</span></button>
          <button className={`nav-item ${activeView === "license" ? "active" : ""}`} onClick={() => handleNav("license")}><ShieldCheck size={19} /><span>الترخيص</span></button>
        </nav>
        <div className="sidebar-bottom">
          <div className="tip-card">
            <Sparkles size={18} />
            <div><b>مرحباً بك!</b><p>يعمل النظام بالكامل دون اتصال بالإنترنت.</p></div>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="mobile-menu icon-button" onClick={() => setMenuOpen(true)}><Menu size={22} /></button>
          <div className="breadcrumb"><span>الرئيسية</span><ChevronLeft size={15} /><b>{title}</b></div>
          <div className="topbar-actions">
            <button className="icon-button notification" aria-label="الإشعارات" onClick={() => setToast("لا توجد إشعارات جديدة")}><Bell size={19} /><i /></button>
          </div>
        </header>

        <div className="page-wrap">
          {activeView === "overview" && (
            <>
              <section className="hero-row">
                <div>
                  <div className="eyebrow"><span className="live-dot" /> ملخص اليوم</div>
                  <h1>{new Date().getHours() < 12 ? "صباح الخير،" : new Date().getHours() < 18 ? "مساء الخير،" : "مرحباً،"} <span>{shopSettings.name}</span></h1>
                  <p>هذا ملخص سريع لوضعك المالي الحالي.</p>
                </div>
                <div className="hero-actions">
                  <button className="secondary-button" onClick={() => setActiveView("reports")}><FileText size={17} /> فتح التقارير</button>
                  <button className="primary-button" onClick={() => setShowTransaction(true)}><Plus size={18} /> عملية جديدة</button>
                </div>
              </section>
              <section className="stats-grid">
                <StatCard label="إجمالي ديون لي" value={formatMoney(totals.receivables, overviewCurrency)} hint="إجمالي المبالغ المستحقة لك" icon={WalletCards} accent="green" />
                <StatCard label="إجمالي ديون علي" value={formatMoney(totals.payables, overviewCurrency)} hint="إجمالي المبالغ المستحقة عليك" icon={CircleDollarSign} accent="blue" />
                <StatCard label="عمليات هذا الشهر" value={totals.monthTransactions.toLocaleString("en-US")} hint={`بعملة ${overviewCurrency?.symbol || overviewCurrency?.code || ""}`} icon={TrendingUp} accent="orange" />
                <StatCard label="إجمالي العملاء" value={totals.customers.toLocaleString("en-US")} hint="مسجلين في النظام" icon={UsersRound} accent="purple" />
              </section>
              <section className="content-grid">
                <div className="card balance-chart-card">
                  <div className="card-heading">
                    <div><h2>حركة الأموال</h2><p>الإيرادات والمصروفات خلال 6 أشهر</p></div>
                    <button className="period-select">آخر 6 أشهر <ChevronDown size={15} /></button>
                  </div>
                  <div className="legend">
                    <span><i className="legend-dot green-dot" /> الإيرادات (صرف لك)</span>
                    <span><i className="legend-dot orange-dot" /> المصروفات (قبض منك)</span>
                  </div>
                  <div className="chart-area">
                    <div className="chart-y">{[1, 0.75, 0.5, 0.25, 0].map((ratio) => <span key={ratio}>{formatMoney(Math.round(chartMax * ratio), overviewCurrency)}</span>)}</div>
                    <div className="bars">
                      {monthlyChart.map((item) => (
                        <div className="bar-group" key={item.label}>
                          <div className="bar-pair">
                            <span className="bar income" style={{ height: `${item.income ? Math.max(5, item.income / chartMax * 100) : 0}%` }} />
                            <span className="bar expense" style={{ height: `${item.expense ? Math.max(5, item.expense / chartMax * 100) : 0}%` }} />
                          </div>
                          <small>{item.label}</small>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="card quick-card">
                  <div className="card-heading">
                    <div><h2>إجراءات سريعة</h2><p>الوصول السريع للمهام</p></div>
                    <SlidersHorizontal size={18} className="muted-icon" />
                  </div>
                  <div className="quick-grid">
                    <button onClick={() => setShowAdd(true)}><span className="quick-icon green"><UserRound size={19} /></span><b>عميل جديد</b><small>إضافة سجل عميل</small><ChevronLeft size={16} /></button>
                    <button onClick={() => setShowTransaction(true)}><span className="quick-icon blue"><ArrowDownLeft size={19} /></span><b>سند قبض/صرف</b><small>تسجيل حركة مالية</small><ChevronLeft size={16} /></button>
                    <button onClick={() => handleNav("reports")}><span className="quick-icon orange"><FileText size={19} /></span><b>التقارير</b><small>استخراج الكشوفات</small><ChevronLeft size={16} /></button>
                    <button onClick={() => handleNav("analytics")}><span className="quick-icon purple"><Sparkles size={19} /></span><b>ذكاء الأعمال</b><small>تحليلات مالية متقدمة</small><ChevronLeft size={16} /></button>
                  </div>
                </div>
              </section>
              <section className="bottom-grid">
                <div className="card accounts-card">
                  <div className="card-heading">
                    <div><h2>حسابات حديثة النشاط</h2><p>آخر العملاء والموردين المتعاملين</p></div>
                    <button className="text-button" onClick={() => handleNav("accounts")}>عرض الكل <ChevronLeft size={16} /></button>
                  </div>
                  <div className="account-list">
                    {customers.slice(0, 4).map((customer) => (
                      <button className="account-row" key={customer.id} onClick={() => setSelectedCustomer(customer)}>
                        <Avatar customer={customer} />
                        <div className="account-meta">
                          <b>{customer.name}</b>
                          <span>{customer.group} • {customer.lastActivity}</span>
                        </div>
                        <div className="account-balance">
                          <strong className={customer.balance > 0 ? "debit" : customer.balance < 0 ? "credit" : "balanced"}>{customer.balance === 0 ? "صفر" : `${customer.balance > 0 ? "+" : "-"}${formatMoney(customer.balance, overviewCurrency)}`}</strong>
                          <small>{customer.status}</small>
                        </div>
                        <ChevronLeft size={17} className="row-arrow" />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="card activity-card">
                  <div className="card-heading">
                    <div><h2>سجل العمليات</h2><p>أحدث الحركات المسجلة اليوم</p></div>
                    <button className="icon-button" onClick={() => setActiveView("transactions")}><ArrowUpLeft size={17} /></button>
                  </div>
                  <div className="activity-list">
                    {transactions.slice(0, 4).map((transaction) => (
                      <div className="activity-row" key={transaction.id}>
                        <span className={`activity-icon ${transaction.type === "قبض" ? "in" : "out"}`}>{transaction.type === "قبض" ? <ArrowDownLeft size={17} /> : <ArrowUpLeft size={17} />}</span>
                        <div>
                          <b>{transaction.customer}</b>
                          <span>{transaction.note} • {transaction.date}</span>
                        </div>
                        <strong className={transaction.type === "قبض" ? "in-text" : "out-text"}>{transaction.type === "قبض" ? "+" : "-"}{formatMoney(transaction.amount, currencyFor(transaction.currencyId))}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </>
          )}

          {activeView === "accounts" && (
            <section className="inner-view">
              <div className="view-heading">
                <div><div className="eyebrow"><UsersRound size={15} /> دليل الحسابات</div><h1>إدارة العملاء</h1><p>سجل العملاء والموردين وأرصدتهم الحالية.</p></div>
                <button className="primary-button" onClick={() => setShowAdd(true)}><Plus size={18} /> إضافة عميل</button>
              </div>
              <div className="card table-card">
                <div className="table-toolbar">
                  <div className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="بحث بالاسم أو الرقم..." /></div>
                  <button className="secondary-button compact"><Filter size={16} /> تصفية</button>
                </div>
                {filteredCustomers.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>الاسم</th><th>المجموعة</th><th>آخر نشاط</th><th>الرصيد</th><th>الحالة</th><th>إجراءات</th></tr></thead>
                      <tbody>
                        {filteredCustomers.map((customer) => (
                          <tr key={customer.id}>
                            <td>
                              <button className="table-person" onClick={() => setSelectedCustomer(customer)}>
                                <Avatar customer={customer} size="sm" />
                                <span><b>{customer.name}</b><small>{customer.phone}</small></span>
                              </button>
                            </td>
                            <td>{customer.group}</td>
                            <td>{customer.lastActivity}</td>
                            <td className={customer.balance > 0 ? "debit" : customer.balance < 0 ? "credit" : "balanced"}>{customer.balance === 0 ? "صفر" : `${customer.balance > 0 ? "+" : "-"}${formatMoney(customer.balance, overviewCurrency)}`}</td>
                            <td><span className={`status-pill ${customer.status === "مدين" ? "status-debit" : customer.status === "دائن" ? "status-credit" : "status-balanced"}`}><i />{customer.status}</span></td>
                            <td>
                              <div className="row-actions">
                                <button className="icon-button" title="كشف حساب" onClick={() => { setReportCustomerId(customer.id); handleNav("reports"); }}><FileText size={16} /></button>
                                <button className="icon-button" title={customer.transactionCount ? "لا يمكن تعديل عميل له حركات" : "تعديل"} onClick={() => customer.transactionCount ? setToast("لا يمكن التعديل لوجود حركات مالية") : setEditingCustomer(customer)}><Pencil size={16} /></button>
                                <button className="icon-button danger-button" title={customer.transactionCount ? "لا يمكن حذف عميل له حركات" : "حذف"} onClick={() => removeCustomer(customer)}><Trash2 size={16} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <EmptyState title="لا يوجد عملاء" description="قم بإضافة عملاء وموردين للبدء بتسجيل حساباتهم." onAdd={() => setShowAdd(true)} />}
              </div>
            </section>
          )}

          {(activeView === "sales-vouchers" || activeView === "purchase-vouchers") && (
            <section className="inner-view voucher-page">
              <div className="view-heading">
                <div><div className="eyebrow"><FileText size={15} /> {activeView === "purchase-vouchers" ? "فواتير المشتريات" : "فواتير المبيعات"}</div><h1>{activeView === "purchase-vouchers" ? "فواتير المشتريات" : "فواتير المبيعات"}</h1><p>تسجيل الفواتير للأصناف والكميات.</p></div>
                <button className="primary-button" onClick={() => { setVoucherType(activeView === "purchase-vouchers" ? "purchase" : "sales"); setSalesRows([]); setVoucherDraft({ item: "", quantity: "", unit: "", amount: "" }); setShowSalesVoucher(true); }}><Plus size={18} /> فاتورة جديدة</button>
              </div>
              <div className="card sales-voucher-intro">
                <FileText size={28} />
                <div><h2>{activeView === "purchase-vouchers" ? "فواتير المشتريات" : "فواتير المبيعات"}</h2><p>يمكنك إصدار الفواتير المفصلة بالكميات والأصناف ليتم ترحيلها إلى حسابات العملاء.</p></div>
                <button className="primary-button" onClick={() => { setVoucherType(activeView === "purchase-vouchers" ? "purchase" : "sales"); setSalesRows([]); setVoucherDraft({ item: "", quantity: "", unit: "", amount: "" }); setShowSalesVoucher(true); }}><Plus size={17} /> إضافة فاتورة</button>
              </div>
            </section>
          )}

          {activeView === "transactions" && (
            <section className="inner-view">
              <div className="view-heading">
                <div><div className="eyebrow"><ArrowDownLeft size={15} /> سجل الحركة</div><h1>العمليات المالية</h1><p>كافة حركات القبض والصرف بالتفصيل.</p></div>
                <button className="primary-button" onClick={() => setShowTransaction(true)}><Plus size={18} /> عملية جديدة</button>
              </div>
              <div className="currency-view-picker">
                <label><CircleDollarSign size={17} /> عرض الحركات بعملة:
                  <select value={selectedCurrencyId} onChange={(event) => setSelectedCurrencyId(Number(event.target.value))}>
                    {currencies.map((currency) => <option key={currency.id} value={currency.id}>{currency.name} - {currency.code} ({currency.symbol})</option>)}
                  </select>
                </label>
                <span>يتم عرض العمليات المرتبطة بهذه العملة فقط</span>
              </div>
              <div className="card table-card">
                <div className="table-toolbar">
                  <div className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="بحث في العمليات..." /></div>
                  <div className="period-controls">
                    <select value={transactionPeriod} onChange={(event) => setTransactionPeriod(event.target.value as "all" | "today" | "month" | "date")}>
                      <option value="all">كل الفترات</option>
                      <option value="today">اليوم</option>
                      <option value="month">هذا الشهر</option>
                      <option value="date">تاريخ محدد</option>
                    </select>
                    {transactionPeriod === "date" && <input aria-label="اختر التاريخ" type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />}
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>العميل</th><th>نوع السند</th><th>البيان</th><th>مناولة</th><th>التاريخ</th><th>المبلغ</th><th>إجراءات</th></tr></thead>
                    <tbody>
                      {visibleTransactions.filter((transaction) => `${transaction.customer} ${transaction.note}`.toLowerCase().includes(query.toLowerCase())).map((transaction) => (
                        <tr key={transaction.id}>
                          <td><b>{transaction.customer}</b></td>
                          <td><span className={`type-pill ${transaction.type === "قبض" ? "type-in" : "type-out"}`}>{transaction.type === "قبض" ? <ArrowDownLeft size={14} /> : <ArrowUpLeft size={14} />}{transaction.voucherType || (transaction.type === "قبض" ? "سند قبض" : "سند صرف")}</span></td>
                          <td>{transaction.note}<small className="currency-badge">{transaction.currencyCode}</small></td>
                          <td>{transaction.handover || "-"}</td>
                          <td>{transaction.date}</td>
                          <td className={transaction.type === "قبض" ? "in-text" : "out-text"}>{transaction.type === "قبض" ? "+" : "-"}{formatMoney(transaction.amount, currencyFor(transaction.currencyId))}</td>
                          <td>
                            <div className="row-actions">
                              <button className="icon-button" title="تعديل" onClick={() => setEditingTransaction(transaction)}><Pencil size={16} /></button>
                              <button className="icon-button danger-button" title="حذف" onClick={() => removeTransaction(transaction)}><Trash2 size={16} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {activeView === "reports" && (
            <section ref={reportRef} className="inner-view report-page">
              <div className="report-shop-header">
                {shopSettings.logo && <img src={shopSettings.logo} alt="شعار المحل" />}
                <div><h2>{shopSettings.name}</h2><p>{shopSettings.phone}{shopSettings.countryCode ? ` - ${shopSettings.countryCode}` : ""}</p></div>
              </div>
              <div className="view-heading">
                <div><div className="eyebrow"><BarChart3 size={15} /> التحليلات</div><h1>التقارير والكشوفات</h1><p>استخراج وطباعة كشوفات الحسابات.</p></div>
                <div className="report-actions">
                  <button className="secondary-button" onClick={() => saveReportPdf('save')}><Download size={17} /> حفظ PDF</button>
                  <button className="secondary-button" onClick={() => saveReportPdf('share')}><Share2 size={17} /> مشاركة PDF</button>
                  <button className="secondary-button" onClick={shareCustomerReport}><Share2 size={17} /> مشاركة واتساب</button>
                </div>
              </div>
              <div className="card report-controls">
                <div className="report-control account-picker">
                  <label>حساب العميل/المورد</label>
                  <div className="search-box"><Search size={17} /><input value={reportCustomerQuery} onChange={(event) => setReportCustomerQuery(event.target.value)} placeholder="ابحث باسم العميل..." /></div>
                  <select value={reportCustomerId ?? ""} onChange={(event) => setReportCustomerId(Number(event.target.value))}>
                    {reportCustomerOptions.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} - {customer.phone}</option>)}
                  </select>
                </div>
                <div className="report-control">
                  <label>العملة</label>
                  <select value={reportCurrencyId} onChange={(event) => setReportCurrencyId(event.target.value === "all" ? "all" : Number(event.target.value))}>
                    <option value="all">كل العملات</option>
                    {currencies.map((currency) => <option key={currency.id} value={currency.id}>{currency.name} ({currency.code})</option>)}
                  </select>
                </div>
                <div className="report-control">
                  <label>الفترة</label>
                  <select value={reportPeriod} onChange={(event) => setReportPeriod(event.target.value as "all" | "date" | "range")}>
                    <option value="all">كل الفترات</option>
                    <option value="date">يوم محدد</option>
                    <option value="range">من - إلى</option>
                  </select>
                </div>
                {reportPeriod === "date" && (
                  <div className="report-control">
                    <label>تاريخ اليوم</label>
                    <input type="date" value={reportFromDate} onChange={(event) => setReportFromDate(event.target.value)} />
                  </div>
                )}
                {reportPeriod === "range" && (
                  <>
                    <div className="report-control">
                      <label>من تاريخ</label>
                      <input type="date" value={reportFromDate} onChange={(event) => setReportFromDate(event.target.value)} />
                    </div>
                    <div className="report-control">
                      <label>إلى تاريخ</label>
                      <input type="date" value={reportToDate} onChange={(event) => setReportToDate(event.target.value)} />
                    </div>
                  </>
                )}
                <div className="report-mode">
                  <button type="button" className="primary-button compact" onClick={() => setReportRequested(true)}><FileText size={16} /> عرض التقرير</button>
                  <button className={reportMode === "detail" ? "active" : ""} onClick={() => setReportMode("detail")}><FileText size={16} /> تفصيلي</button>
                  <button className={reportMode === "summary" ? "active" : ""} onClick={() => setReportMode("summary")}><BarChart3 size={16} /> ملخص</button>
                </div>
              </div>

              <div className="report-document" dir="rtl" style={{ display: reportRequested && reportCustomer ? undefined : "none" }}>
                <header className="report-document-header">
                  {shopSettings.logo ? <img src={shopSettings.logo} alt="شعار المحل" /> : <div className="report-logo-placeholder"><FileText size={28} /></div>}
                  <div><h2>{shopSettings.name}</h2><p>{shopSettings.phone || ""}{shopSettings.countryCode ? ` - ${shopSettings.countryCode}` : ""}</p></div>
                </header>
                <div className="report-document-title">
                  <h1>كشف حساب تفصيلي</h1>
                  <p>الفترة المحددة في التقرير</p>
                </div>
                <div className="report-document-meta">
                  <div><span>اسم العميل:</span><b>{reportCustomer?.name || ""}</b></div>
                  <div><span>رقم الهاتف:</span><b>{reportCustomer?.phone || ""}</b></div>
                  <div><span>تاريخ الكشف:</span><b>{reportPeriod === "all" ? "حتى تاريخ اليوم" : reportPeriod === "date" ? `في ${reportFromDate || "غير محدد"}` : `من ${reportFromDate || "غير محدد"} إلى ${reportToDate || "غير محدد"}`}</b></div>
                  <div><span>العملة المحددة:</span><b>{reportCurrencyId === "all" ? "جميع العملات" : currencies.find((currency) => currency.id === reportCurrencyId)?.name || ""}</b></div>
                </div>
                {reportMode === "detail" ? (
                  reportRowsByCurrency.filter((item) => reportCurrencyId === "all" || item.currency.id === reportCurrencyId).map(({ currency, rows, totalIn, totalOut }) => (
                    <section className="report-document-currency" key={currency.id}>
                      <div className="report-document-currency-head">
                        <h2>{currency.name} ({currency.code})</h2>
                        <strong>الرصيد: {Math.abs(totalIn - totalOut).toLocaleString("en-US")} {currency.symbol} - {totalIn >= totalOut ? "له (دائن)" : "عليه (مدين)"}</strong>
                      </div>
                      <table>
                        <thead>
                          <tr><th>التاريخ</th><th>نوع السند</th><th style={{ width: "35%" }}>البيان والملاحظات</th><th>مناولة</th><th>مدين (عليه)</th><th>دائن (له)</th></tr>
                        </thead>
                        <tbody>
                          {rows.length ? rows.map((transaction) => (
                            <tr key={transaction.id}>
                              <td style={{ whiteSpace: "nowrap" }}>{transaction.date}</td>
                              <td style={{ whiteSpace: "nowrap", fontSize: "10px", fontWeight: "bold", color: "#405259" }}>{transaction.voucherType || (transaction.type === "قبض" ? "سند قبض" : "سند صرف")}</td>
                              <td className="report-note-cell" style={{ fontSize: "11px" }}>{transaction.note}</td>
                              <td>{transaction.handover || "-"}</td>
                              <td className="report-amount-cell" style={{ color: transaction.type === "صرف" ? "#db8240" : "inherit" }}>{transaction.type === "صرف" ? transaction.amount.toLocaleString("en-US") : "-"}</td>
                              <td className="report-amount-cell" style={{ color: transaction.type === "قبض" ? "#17845e" : "inherit" }}>{transaction.type === "قبض" ? transaction.amount.toLocaleString("en-US") : "-"}</td>
                            </tr>
                          )) : <tr><td colSpan={6}>لا توجد حركات بهذه العملة في الفترة المحددة</td></tr>}
                        </tbody>
                        <tfoot>
                          <tr>
                            <th colSpan={4}>الإجمالي:</th>
                            <th style={{ color: "#db8240" }}>{totalOut.toLocaleString("en-US")} {currency.symbol}</th>
                            <th style={{ color: "#17845e" }}>{totalIn.toLocaleString("en-US")} {currency.symbol}</th>
                          </tr>
                          <tr style={{ background: "#e9f3ef" }}>
                            <th colSpan={4}>الرصيد النهائي:</th>
                            <th colSpan={2} style={{ textAlign: "center", fontSize: "14px" }}>
                              {Math.abs(totalIn - totalOut).toLocaleString("en-US")} {currency.symbol} - {totalIn >= totalOut ? "له (دائن)" : "عليه (مدين)"}
                            </th>
                          </tr>
                        </tfoot>
                      </table>
                    </section>
                  ))
                ) : (
                  <table className="report-document-summary">
                    <thead><tr><th>العملة</th><th>إجمالي المقبوضات</th><th>إجمالي المنصرفات</th><th>الرصيد الصافي</th><th>حالة الرصيد</th></tr></thead>
                    <tbody>
                      {reportRowsByCurrency.map(({ currency, totalIn, totalOut }) => (
                        <tr key={currency.id}>
                          <td><b>{currency.name} ({currency.code})</b></td>
                          <td className="in-text">{totalIn.toLocaleString("en-US")} {currency.symbol}</td>
                          <td className="out-text">{totalOut.toLocaleString("en-US")} {currency.symbol}</td>
                          <td>{Math.abs(totalIn - totalOut).toLocaleString("en-US")} {currency.symbol}</td>
                          <td className={totalIn >= totalOut ? "credit" : "debit"}>{totalIn >= totalOut ? "له (دائن)" : "عليه (مدين)"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <footer className="report-document-footer">
                  <span>إجمالي الحركات: {reportTransactions.length.toLocaleString("en-US")}</span>
                  <span>تاريخ الطباعة: {new Date().toLocaleDateString("ar-YE")}</span>
                </footer>
              </div>

              <div style={{ display: reportRequested ? undefined : "none" }} className="card currency-totals-report account-global-report legacy-report">
                <div className="card-heading">
                  <div><div className="eyebrow"><CircleDollarSign size={15} /> إجمالي الحساب</div><h2>أرصدة كل العملات</h2><p>ملخص الرصيد لكل عملة على حدة.</p></div>
                  <strong>{globalReportTransactions.length.toLocaleString("en-US")} حركة</strong>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>العملة</th><th>المقبوضات (له)</th><th>المنصرفات (عليه)</th><th>الرصيد</th><th>الحالة</th></tr></thead>
                    <tbody>
                      {globalCurrencyTotals.map(({ currency, credit, debit, net }) => (
                        <tr key={currency.id}>
                          <td><span className="currency-line"><b className="currency-symbol small">{currency.symbol}</b><strong>{currency.name} ({currency.code})</strong></span></td>
                          <td className="in-text">{credit.toLocaleString("en-US")} {currency.symbol}</td>
                          <td className="out-text">{debit.toLocaleString("en-US")} {currency.symbol}</td>
                          <td className={net >= 0 ? "credit" : "debit"}>{Math.abs(net).toLocaleString("en-US")} {currency.symbol}</td>
                          <td><span className={`status-pill ${net >= 0 ? "status-credit" : "status-debit"}`}><i />{net >= 0 ? "متزن/له" : "عليه"}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {reportCustomer ? (
                <div style={{ display: reportRequested ? undefined : "none" }} className="report-result legacy-report">
                  <div className="report-customer-banner">
                    <Avatar customer={reportCustomer} size="md" />
                    <div><b>{reportCustomer.name}</b><span>{reportCustomer.phone} • {reportCustomer.group}</span></div>
                    <strong>{reportTransactions.length.toLocaleString("en-US")} حركة</strong>
                  </div>
                  {reportMode === "detail" ? (
                    <div className="report-tables">
                      {reportRowsByCurrency.filter((item) => reportCurrencyId === "all" || item.currency.id === reportCurrencyId).map(({ currency, rows, totalIn, totalOut }) => (
                        <div className="card report-currency-table" key={currency.id}>
                          <div className="card-heading">
                            <div><h2>{currency.name} ({currency.code})</h2><p>العمليات بهذه العملة</p></div>
                            <strong className={totalIn - totalOut >= 0 ? "credit" : "debit"}>{totalIn >= totalOut ? "له" : "عليه"} {Math.abs(totalIn - totalOut).toLocaleString("en-US")} {currency.symbol}</strong>
                          </div>
                          <div className="table-wrap">
                            <table>
                              <thead><tr><th>التاريخ</th><th>نوع السند</th><th>البيان</th><th>مناولة</th><th>مدين (عليه)</th><th>دائن (له)</th></tr></thead>
                              <tbody>
                                {rows.length ? rows.map((transaction) => (
                                  <tr key={transaction.id}>
                                    <td style={{ whiteSpace: "nowrap" }}>{transaction.date}</td>
                                    <td style={{ whiteSpace: "nowrap" }}>{transaction.voucherType || (transaction.type === "قبض" ? "سند قبض" : "سند صرف")}</td>
                                    <td>{transaction.note}</td>
                                    <td>{transaction.handover || "-"}</td>
                                    <td className="out-text">{transaction.type === "صرف" ? transaction.amount.toLocaleString("en-US") : "-"}</td>
                                    <td className="in-text">{transaction.type === "قبض" ? transaction.amount.toLocaleString("en-US") : "-"}</td>
                                  </tr>
                                )) : <tr><td colSpan={6}>لا توجد بيانات</td></tr>}
                              </tbody>
                              <tfoot><tr><th colSpan={4}>الإجمالي: مقبوضات {totalIn.toLocaleString("en-US")} - منصرفات {totalOut.toLocaleString("en-US")}</th><th colSpan={2}>{(totalIn - totalOut).toLocaleString("en-US")} {currency.symbol}</th></tr></tfoot>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="card report-summary-table">
                      <table>
                        <thead><tr><th>العملة</th><th>المقبوضات</th><th>المنصرفات</th><th>الرصيد</th><th>الحالة</th></tr></thead>
                        <tbody>
                          {reportRowsByCurrency.map(({ currency, totalIn, totalOut }) => (
                            <tr key={currency.id}>
                              <td><b>{currency.name} ({currency.code})</b></td>
                              <td className="in-text">{totalIn.toLocaleString("en-US")} {currency.symbol}</td>
                              <td className="out-text">{totalOut.toLocaleString("en-US")} {currency.symbol}</td>
                              <td>{Math.abs(totalIn - totalOut).toLocaleString("en-US")} {currency.symbol}</td>
                              <td className={totalIn >= totalOut ? "credit" : "debit"}>{totalIn >= totalOut ? "له" : "عليه"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: reportRequested ? undefined : "none" }} className="card empty-report">
                  <FileText size={26} />
                  <h3>التقرير فارغ</h3>
                  <p>الرجاء اختيار عميل وتحديد فترات التقرير ثم النقر على عرض.</p>
                </div>
              )}
            </section>
          )}

          {activeView === "analytics" && (
            <section className="inner-view analytics-page">
              <div className="view-heading">
                <div><div className="eyebrow"><Sparkles size={15} /> التحليلات المالية</div><h1>ذكاء الأعمال</h1><p>رؤى وتحليلات متقدمة للأداء المالي الخاص بك.</p></div>
                <select value={selectedCurrencyId} onChange={(event) => setSelectedCurrencyId(Number(event.target.value))}>
                  {currencies.map(currency => <option key={currency.id} value={currency.id}>{currency.name} ({currency.code})</option>)}
                </select>
              </div>

              <div className="stats-grid" style={{ marginBottom: 20 }}>
                <StatCard label="إجمالي المقبوضات" value={analyticsData.incomeTotal.toLocaleString("en-US")} hint={`بعملة ${analyticsData.currency?.symbol}`} icon={TrendingUp} accent="green" />
                <StatCard label="إجمالي المنصرفات" value={analyticsData.expenseTotal.toLocaleString("en-US")} hint={`بعملة ${analyticsData.currency?.symbol}`} icon={ArrowDownLeft} accent="orange" />
              </div>

              <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-heading">
                  <div><h2>إجمالي الحركة لكل العملات</h2><p>ملخص شامل لجميع التصنيفات</p></div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>العملة</th><th>إجمالي الوارد (مقبوضات)</th><th>إجمالي المنصرف (صرف)</th><th>الرصيد الصافي</th><th>الحالة</th></tr></thead>
                    <tbody>
                      {analyticsData.summaries.map((summary) => (
                        <tr key={summary.currency.id}>
                          <td><b>{summary.currency.name} ({summary.currency.code})</b></td>
                          <td className="in-text">{summary.totalIn.toLocaleString("en-US")} {summary.currency.symbol}</td>
                          <td className="out-text">{summary.totalOut.toLocaleString("en-US")} {summary.currency.symbol}</td>
                          <td>{Math.abs(summary.net).toLocaleString("en-US")} {summary.currency.symbol}</td>
                          <td className={summary.net >= 0 ? "credit" : "debit"}>{summary.net >= 0 ? "له" : "عليه"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card">
                <div className="card-heading">
                  <div><h2>التدفق النقدي للـ 6 أشهر الأخيرة</h2><p>تحليل حركة المقبوضات والمنصرفات</p></div>
                </div>
                <div style={{ height: 320, width: "100%", marginTop: 20 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analyticsData.flowData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(val) => val.toLocaleString("en-US")} />
                      <Tooltip contentStyle={{ borderRadius: 12, border: "none", boxShadow: "0 10px 25px rgba(0,0,0,0.1)", fontSize: 13 }} itemStyle={{ padding: 4 }} />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                      <Bar name="مقبوضات" dataKey="income" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
                      <Bar name="منصرفات" dataKey="expense" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>
          )}

          {activeView === "currencies" && (
            <section className="inner-view">
              <div className="view-heading">
                <div><div className="eyebrow"><CircleDollarSign size={15} /> إعدادات النظام</div><h1>إدارة العملات</h1><p>العملات المدعومة في النظام والمستخدمة في الحركات.</p></div>
                <button className="primary-button" onClick={() => setShowCurrency(true)}><Plus size={18} /> إضافة عملة</button>
              </div>
              <div className="currency-grid">
                {currencies.map((currency) => (
                  <div className={`card currency-card ${selectedCurrencyId === currency.id ? "selected" : ""}`} key={currency.id} onClick={() => { setSelectedCurrencyId(currency.id); setActiveView("transactions"); }}>
                    <div className="currency-symbol">{currency.symbol}</div>
                    <div className="currency-info">
                      <h2>{currency.name}</h2>
                      <span>{currency.code} • {currency.transactionCount.toLocaleString("en-US")} حركة مسجلة</span>
                    </div>
                    <div className="currency-actions">
                      <button className="icon-button" title="تعديل" onClick={(event) => { event.stopPropagation(); setEditingCurrency(currency); }}><Pencil size={16} /></button>
                      <button className="icon-button danger-button" title={currency.transactionCount ? "لا يمكن حذف عملة مستخدمة" : "حذف"} onClick={(event) => { event.stopPropagation(); removeCurrency(currency); }}><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeView === "backup" && (
            <section className="inner-view">
              <div className="view-heading">
                <div><div className="eyebrow"><Download size={15} /> الأمان والحفظ</div><h1>النسخ الاحتياطي</h1><p>حفظ نسخة من قاعدة بيانات SQLite واستعادتها.</p></div>
                <button className="primary-button" onClick={chooseBackupFolder}><Download size={17} /> إعداد المجلد</button>
              </div>
              <div className="backup-grid">
                <div className="card backup-main-card">
                  <div className="backup-main-icon"><BookOpen size={27} /></div>
                  <h2>حفظ البيانات محلياً</h2>
                  <p>النسخ الاحتياطي يتم من خلال ملف SQLite يمكن فتحه في أي تطبيق قواعد بيانات.</p>
                  <div className="backup-path"><span>مسار الحفظ الحالي:</span><b>{backupFolder || "لم يتم التحديد بعد"}</b></div>
                  <div className="backup-card-actions">
                    <button className="primary-button" onClick={chooseBackupFolder}><Download size={17} /> اختيار المجلد</button>
                    <button className="secondary-button" onClick={downloadBackup}><Download size={16} /> تحميل الملف</button>
                    <button className="secondary-button" onClick={createZeroDatabase}><Trash2 size={16} /> تصفير</button>
                  </div>
                </div>
                <div className="card backup-settings-card">
                  <div className="card-heading">
                    <div><h2>النسخ التلقائي</h2><p>مدعوم في تطبيق APK فقط.</p></div>
                    <RefreshCcw size={18} className="muted-icon" />
                  </div>
                  <div className="auto-options">
                    <label className={`auto-option ${backupFrequency === "daily" ? "selected" : ""}`}>
                      <input type="radio" name="backup-frequency" checked={backupFrequency === "daily"} onChange={() => { setBackupFrequency("daily"); localStorage.setItem("daftar-backup-frequency", "daily"); }} />
                      <span><b>نسخ يومي</b><small>مرة كل يوم</small></span>
                      <Check size={16} />
                    </label>
                    <label className={`auto-option ${backupFrequency === "hourly" ? "selected" : ""}`}>
                      <input type="radio" name="backup-frequency" checked={backupFrequency === "hourly"} onChange={() => { setBackupFrequency("hourly"); localStorage.setItem("daftar-backup-frequency", "hourly"); }} />
                      <span><b>نسخ متكرر</b><small>كل 60 دقيقة</small></span>
                      <Check size={16} />
                    </label>
                  </div>
                  <div className="retention-row">
                    <span><b>الاحتفاظ بالنسخ</b><small>النسخ القديمة</small></span>
                    <strong>آخر 3</strong>
                  </div>
                  <div className="backup-note"><Bell size={15} /> النسخ التلقائي يتطلب تطبيق APK وتحديد صلاحية الوصول.</div>
                </div>
                <div className="card backup-action-card">
                  <span className="backup-action-icon share"><Share2 size={20} /></span>
                  <div><h3>مشاركة النسخة</h3><p>إرسالها عبر واتساب أو Google Drive لحفظها سحابياً.</p></div>
                  <button className="secondary-button compact" onClick={shareDatabase}>مشاركة</button>
                </div>
                <div className="card backup-action-card">
                  <span className="backup-action-icon restore"><RefreshCcw size={20} /></span>
                  <div><h3>استعادة البيانات</h3><p>استعادة نسخة سابقة من ملف SQLite محفوظ لديك.</p></div>
                  <button className="secondary-button compact" onClick={restoreBackup}>استعادة</button>
                </div>
              </div>
            </section>
          )}

          {activeView === "license" && (
            <section className="inner-view license-page">
              <div className="view-heading">
                <div><div className="eyebrow"><ShieldCheck size={15} /> حالة النظام</div><h1>الترخيص والتفعيل</h1><p>إدارة ترخيص التطبيق الخاص بك.</p></div>
                <span className={`license-status-badge ${licenseInfo.isLicensed ? "licensed" : licenseInfo.isExpired ? "expired" : "trial"}`}>{licenseInfo.isLicensed ? "مرخص بالكامل" : licenseInfo.isExpired ? "منتهي الصلاحية" : "نسخة تجريبية"}</span>
              </div>
              <div className="license-grid">
                <div className={`card license-status-card ${licenseInfo.isLicensed ? "is-licensed" : licenseInfo.isExpired ? "is-expired" : "is-trial"}`}>
                  <div className="license-icon">{licenseInfo.isLicensed ? <ShieldCheck size={31} /> : licenseInfo.isExpired ? <ShieldAlert size={31} /> : <Clock3 size={31} />}</div>
                  <div>
                    <span className="license-kicker">الوضع الحالي</span>
                    <h2>{licenseInfo.statusText}</h2>
                    <p>{licenseInfo.isLicensed ? `ينتهي في: ${licenseInfo.expiresAt || "لا ينتهي"}` : licenseInfo.isExpired ? "يرجى التفعيل للمتابعة واستخدام النظام." : `متبقي من التجربة ${licenseInfo.trialDaysLeft} يوم و ${licenseInfo.trialHoursLeft} ساعة`}</p>
                  </div>
                </div>
                <div className="card device-card">
                  <div className="card-heading">
                    <div><h2>رقم جهازك</h2><p>قم بنسخ هذا الرقم وإرساله للمطور.</p></div>
                    <KeyRound size={21} className="muted-icon" />
                  </div>
                  <div className="device-id-box">
                    <code>{licenseInfo.deviceId}</code>
                    <button className="secondary-button compact" onClick={() => { navigator.clipboard?.writeText(licenseInfo.deviceId); setLicenseMessage("تم نسخ رقم الجهاز"); }}><Copy size={15} /> نسخ</button>
                  </div>
                  <small>كل جهاز له رقم فريد، الترخيص يرتبط بهذا الرقم ولن يعمل على الأجهزة الأخرى.</small>
                </div>
                <div className="card activation-card">
                  <div className="card-heading">
                    <div><h2>تفعيل النظام</h2><p>أدخل المفتاح الذي حصلت عليه من المطور.</p></div>
                    <ShieldCheck size={21} className="muted-icon" />
                  </div>
                  <form onSubmit={(event) => {
                    event.preventDefault();
                    const result = LicenseService.activateLicense(licenseKey, licenseClientName);
                    setLicenseMessage(result.message);
                    if (result.success) {
                      setLicenseInfo(LicenseService.checkStatus());
                      setLicenseKey("");
                    }
                  }}>
                    <label>مفتاح التفعيل
                      <input value={licenseKey} onChange={(event) => setLicenseKey(event.target.value.toUpperCase())} placeholder="DAFTAR-LFT-XXXX-XXXX-XXXX-XXXX-XXXX" dir="ltr" required />
                    </label>
                    <label>اسم المؤسسة <span className="optional-label">(اختياري)</span>
                      <input value={licenseClientName} onChange={(event) => setLicenseClientName(event.target.value)} placeholder="اسم محلك أو مؤسستك" />
                    </label>
                    {licenseMessage && <div className={`license-message ${licenseMessage.includes("نجاح") || licenseMessage.includes("نسخ") ? "success" : "error"}`}>{licenseMessage}</div>}
                    <button className="primary-button" type="submit"><KeyRound size={17} /> تفعيل النظام</button>
                  </form>
                </div>
                <div className="card license-info-card">
                  <h2>كيف تحصل على مفتاح تفعيل؟</h2>
                  <div className="license-steps">
                    <span><b>1</b> انسخ رقم الجهاز</span>
                    <span><b>2</b> تواصل مع المطور</span>
                    <span><b>3</b> احصل على المفتاح</span>
                    <span><b>4</b> أدخله في خانة التفعيل</span>
                  </div>
                  <div className="developer-contact" style={{ marginTop: 24, padding: 16, background: 'rgba(23, 107, 88, 0.05)', borderRadius: 12, border: '1px dashed rgba(23, 107, 88, 0.3)', textAlign: 'center' }}>
                    <h3 style={{ fontSize: 13, color: '#145746', marginBottom: 8, marginTop: 0 }}>للتواصل مع المطور (واتساب / اتصال)</h3>
                    <div style={{ fontSize: 24, fontWeight: 'bold', color: '#176b58', direction: 'ltr', letterSpacing: '2px' }}>770680160</div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeView === "settings" && (
            <section className="inner-view">
              <div className="view-heading">
                <div><div className="eyebrow"><Settings size={15} /> تخصيص النظام</div><h1>إعدادات المحل</h1><p>إعداد بيانات المحل للتقارير والمظهر.</p></div>
              </div>
              <form className="card settings-card shop-settings-form" onSubmit={saveShop}>
                <div className="settings-form-heading">
                  <div className="setting-icon"><UserRound size={18} /></div>
                  <div><b>بيانات المحل</b><span>تظهر في الطباعة.</span></div>
                </div>
                <label>اسم المحل/الشركة <input name="shop-name" required defaultValue={shopSettings.name} /></label>
                <label>رقم الهاتف <input name="shop-phone" defaultValue={shopSettings.phone} placeholder="لإظهاره في التقارير" /></label>
                <label>رابط الشعار <input name="shop-logo" defaultValue={shopSettings.logo} placeholder="رابط صورة الشعار" /></label>
                <div className="settings-two-col">
                  <label>البلد
                    <select name="shop-country" defaultValue={shopSettings.country}>
                      <option>اليمن</option><option>العراق</option><option>السعودية</option><option>الأردن</option>
                      <option>الإمارات</option><option>الكويت</option><option>قطر</option><option>عمان</option>
                      <option>البحرين</option><option>مصر</option>
                    </select>
                  </label>
                  <label>مفتاح الدولة <input name="shop-country-code" defaultValue={shopSettings.countryCode || "+967"} /></label>
                </div>
                <label>العملة الافتراضية
                  <select name="shop-currency" defaultValue={shopSettings.defaultCurrencyId}>
                    {currencies.map((currency) => <option key={currency.id} value={currency.id}>{currency.name} ({currency.symbol})</option>)}
                  </select>
                </label>
                <button className="primary-button" type="submit"><Check size={17} /> حفظ التغييرات</button>
              </form>
              <div className="card settings-card backup-settings-card" style={{ marginTop: '20px' }}>
                <div className="card-heading">
                  <div><h2>جدولة النسخ الاحتياطي التلقائي</h2><p>حفظ نسخة من بياناتك محلياً بشكل دوري (يعمل في تطبيق APK).</p></div>
                  <RefreshCcw size={18} className="muted-icon" />
                </div>
                <div className="auto-options">
                  <label className={`auto-option ${backupFrequency === "daily" ? "selected" : ""}`}>
                    <input type="radio" name="backup-frequency-settings" checked={backupFrequency === "daily"} onChange={() => { setBackupFrequency("daily"); localStorage.setItem("daftar-backup-frequency", "daily"); }} />
                    <span><b>نسخ يومي</b><small>مرة كل يوم</small></span>
                    <Check size={16} />
                  </label>
                  <label className={`auto-option ${backupFrequency === "hourly" ? "selected" : ""}`}>
                    <input type="radio" name="backup-frequency-settings" checked={backupFrequency === "hourly"} onChange={() => { setBackupFrequency("hourly"); localStorage.setItem("daftar-backup-frequency", "hourly"); }} />
                    <span><b>نسخ متكرر</b><small>كل 60 دقيقة</small></span>
                    <Check size={16} />
                  </label>
                </div>
              </div>
            </section>
          )}
        </div>

        <footer className="footer">
          <span>جديعي سوفت <b>v1.0</b> نظام مالي مجاني بدون إنترنت</span>
          <span>جميع البيانات مخزنة محلياً في جهازك</span>
        </footer>
      </main>

      <nav className="mobile-nav">
        {[...navItems, 
          { id: "backup", label: "النسخ", icon: Download },
          { id: "settings", label: "الإعدادات", icon: Settings },
          { id: "license", label: "الترخيص", icon: ShieldCheck }
        ].map(({ id, label, icon: Icon }) => (
          <button key={id} className={activeView === id ? "active" : ""} onClick={() => handleNav(id)}>
            <Icon size={19} /><span>{label}</span>
          </button>
        ))}
      </nav>

      {showAdd && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowAdd(false)}>
          <form className="modal" onSubmit={addCustomer}>
            <div className="modal-header">
              <div><span className="modal-kicker">إضافة سجل</span><h2>عميل / مورد جديد</h2></div>
              <button type="button" className="icon-button" onClick={() => setShowAdd(false)}><X size={19} /></button>
            </div>
            <label>الاسم <input name="name" required autoFocus placeholder="الاسم الكامل" /></label>
            <label>رقم الهاتف <input name="phone" placeholder="07xx xxx xxxx" /></label>
            <label>المجموعة
              <select name="group" defaultValue="عملاء">
                <option>عملاء</option>
                <option>موردين</option>
                <option>شركاء</option>
                <option>أخرى</option>
              </select>
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setShowAdd(false)}>إلغاء</button>
              <button className="primary-button" type="submit"><Check size={17} /> إضافة</button>
            </div>
          </form>
        </div>
      )}

      {showCurrency && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={addCurrency}>
            <div className="modal-header">
              <div><span className="modal-kicker">إعدادات</span><h2>عملة جديدة</h2></div>
              <button type="button" className="icon-button" onClick={() => setShowCurrency(false)}><X size={19} /></button>
            </div>
            <label>اسم العملة <input name="name" required placeholder="دينار عراقي" /></label>
            <label>كود العملة <input name="code" required maxLength={3} placeholder="IQD" /></label>
            <label>الرمز <input name="symbol" required placeholder="د.ع" /></label>
            <label>الفواصل العشرية
              <select name="decimals" defaultValue="2">
                <option value="0">بدون فواصل</option>
                <option value="2">رقمين</option>
                <option value="3">3 أرقام</option>
              </select>
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setShowCurrency(false)}>إلغاء</button>
              <button className="primary-button" type="submit"><Check size={17} /> إضافة</button>
            </div>
          </form>
        </div>
      )}

      {editingCurrency && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={saveCurrencyEdit}>
            <div className="modal-header">
              <div><span className="modal-kicker">تعديل</span><h2>بيانات العملة</h2></div>
              <button type="button" className="icon-button" onClick={() => setEditingCurrency(null)}><X size={19} /></button>
            </div>
            <input type="hidden" name="id" value={editingCurrency.id} />
            <label>الاسم <input name="name" required defaultValue={editingCurrency.name} /></label>
            <label>الكود <input name="code" required maxLength={3} defaultValue={editingCurrency.code} /></label>
            <label>الرمز <input name="symbol" required defaultValue={editingCurrency.symbol} /></label>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setEditingCurrency(null)}>إلغاء</button>
              <button className="primary-button" type="submit"><Check size={17} /> حفظ التعديلات</button>
            </div>
          </form>
        </div>
      )}

      {showSalesVoucher && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowSalesVoucher(false)}>
          <form className="modal sales-voucher-modal" onSubmit={addSalesVoucher}>
            <div className="modal-header">
              <div><span className="modal-kicker">إصدار</span><h2>{voucherType === "purchase" ? "سند مشتريات" : "سند مبيعات"}</h2></div>
              <button type="button" className="icon-button" onClick={() => setShowSalesVoucher(false)}><X size={19} /></button>
            </div>
            <div className="sales-voucher-fields">
              <label>العملة
                <select name="currency" required value={selectedCurrencyId} onChange={(event) => setSelectedCurrencyId(Number(event.target.value))}>
                  {currencies.map((currency) => <option key={currency.id} value={currency.id}>{currency.name} ({currency.code})</option>)}
                </select>
              </label>
              <label>اسم العميل / المورد
                <select name="customer" required defaultValue="">
                  <option value="" disabled>اختر العميل...</option>
                  {customers.map((customer) => <option key={customer.id} value={customer.name}>{customer.name}</option>)}
                </select>
              </label>
              <label>تاريخ الفاتورة <input name="date" type="date" required defaultValue="" /></label>
              <label>اسم المستلم / المسلم <input name="handover" placeholder="اختياري" /></label>
            </div>
            <div className="sales-lines-heading">
              <h3>عناصر الفاتورة</h3>
              <span>أضف الأصناف المطلوبة.</span>
            </div>
            <div className="voucher-item-entry">
              <div className="autocomplete-wrapper">
                <input placeholder="الصنف / البيان" value={voucherDraft.item} onFocus={() => setItemFocused(true)} onBlur={() => setTimeout(() => setItemFocused(false), 200)} onChange={(event) => setVoucherDraft((draft) => ({ ...draft, item: event.target.value }))} />
                {itemFocused && catalogItems.filter(i => i.name.toLowerCase().includes(voucherDraft.item.toLowerCase())).length > 0 && (
                  <div className="autocomplete-dropdown">
                    {catalogItems.filter(i => i.name.toLowerCase().includes(voucherDraft.item.toLowerCase())).map(i => (
                      <div key={i.id} onMouseDown={() => setVoucherDraft(d => ({ ...d, item: i.name }))}>{i.name}</div>
                    ))}
                  </div>
                )}
              </div>
              <input type="number" min="0.01" step="any" placeholder="الكمية" value={voucherDraft.quantity} onChange={(event) => setVoucherDraft((draft) => ({ ...draft, quantity: event.target.value }))} />
              <div className="autocomplete-wrapper">
                <input placeholder="الوحدة" value={voucherDraft.unit} onFocus={() => setUnitFocused(true)} onBlur={() => setTimeout(() => setUnitFocused(false), 200)} onChange={(event) => setVoucherDraft((draft) => ({ ...draft, unit: event.target.value }))} />
                {unitFocused && catalogUnits.filter(u => u.name.toLowerCase().includes(voucherDraft.unit.toLowerCase())).length > 0 && (
                  <div className="autocomplete-dropdown">
                    {catalogUnits.filter(u => u.name.toLowerCase().includes(voucherDraft.unit.toLowerCase())).map(u => (
                      <div key={u.id} onMouseDown={() => setVoucherDraft(d => ({ ...d, unit: u.name }))}>{u.name}</div>
                    ))}
                  </div>
                )}
              </div>
              <input type="number" min="0.01" step="any" placeholder="الإجمالي (لهذا الصنف)" value={voucherDraft.amount} onChange={(event) => setVoucherDraft((draft) => ({ ...draft, amount: event.target.value }))} />
              <button type="button" className="primary-button compact" onClick={insertVoucherRow}><Plus size={15} /> إدراج الصنف</button>
            </div>
            <div className="sales-lines">
              <div className="sales-line header">
                <span>الصنف / البيان</span>
                <span>الكمية</span>
                <span>الوحدة</span>
                <span>الإجمالي الجزئي</span>
                <span />
              </div>
              {salesRows.map((row, index) => (
                <div className="sales-line" key={`${row.item}-${index}`}>
                  <span>{row.item}</span>
                  <span>{row.quantity}</span>
                  <span>{row.unit}</span>
                  <span>{row.amount.toLocaleString("en-US")}</span>
                  <button type="button" className="icon-button danger-button" onClick={() => setSalesRows((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
            <div className="sales-total">
              <span>الإجمالي الكلي:</span>
              <strong>{salesRows.reduce((sum, row) => sum + Number(row.amount || 0), 0).toLocaleString("en-US")} {currencies.find((currency) => currency.id === selectedCurrencyId)?.symbol || ""}</strong>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setShowSalesVoucher(false)}>إلغاء</button>
              <button className="primary-button" type="submit"><Check size={17} /> حفظ الفاتورة وترحيلها</button>
            </div>
          </form>
        </div>
      )}

      {showTransaction && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowTransaction(false)}>
          <form className="modal" onSubmit={addTransaction}>
            <div className="modal-header">
              <div><span className="modal-kicker">تسجيل</span><h2>عملية جديدة</h2></div>
              <button type="button" className="icon-button" onClick={() => setShowTransaction(false)}><X size={19} /></button>
            </div>
            <label>العملة
              <select name="currency" required value={selectedCurrencyId} onChange={(event) => setSelectedCurrencyId(Number(event.target.value))}>
                {currencies.map((currency) => <option key={currency.id} value={currency.id}>{currency.name} ({currency.code})</option>)}
              </select>
            </label>
            <label>العميل المربوط بالعملية
              <select name="customer" required defaultValue="">
                <option value="" disabled>اختر العميل...</option>
                {customers.map((customer) => <option key={customer.id} value={customer.name}>{customer.name}</option>)}
              </select>
            </label>
            <label>نوع العملية
              <select name="type" defaultValue="قبض">
                <option value="قبض">قبض (استلمت منه)</option>
                <option value="صرف">صرف (سلمت له)</option>
              </select>
            </label>
            <label>المبلغ <input name="amount" required type="number" min="1" placeholder="0" /></label>
            <label>التاريخ <input name="date" required type="date" defaultValue="" /></label>
            <label>البيان / التفاصيل <input name="note" placeholder="شرح موجز للعملية" /></label>
            <label>المستلم / المسلم <input name="handover" placeholder="اختياري" /></label>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setShowTransaction(false)}>إلغاء</button>
              <button className="primary-button" type="submit"><Check size={17} /> إضافة وترحيل</button>
            </div>
          </form>
        </div>
      )}

      {editingTransaction && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={saveTransactionEdit}>
            <div className="modal-header">
              <div><span className="modal-kicker">تعديل</span><h2>العملية المالية</h2></div>
              <button type="button" className="icon-button" onClick={() => setEditingTransaction(null)}><X size={19} /></button>
            </div>
            <label>العملة
              <select name="currency" defaultValue={editingTransaction.currencyId}>
                {currencies.map((currency) => <option key={currency.id} value={currency.id}>{currency.name} ({currency.code})</option>)}
              </select>
            </label>
            <label>النوع
              <select name="type" defaultValue={editingTransaction.type}>
                <option value="قبض">قبض (استلمت منه)</option>
                <option value="صرف">صرف (سلمت له)</option>
              </select>
            </label>
            <label>المبلغ <input name="amount" required type="number" min="1" defaultValue={editingTransaction.amount} /></label>
            <label>التاريخ <input name="date" required type="date" defaultValue={transactionDateKey(editingTransaction.date)} /></label>
            <label>البيان <input name="note" defaultValue={editingTransaction.note} /></label>
            <label>المستلم / المسلم <input name="handover" defaultValue={editingTransaction.handover || ""} placeholder="اختياري" /></label>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setEditingTransaction(null)}>إلغاء</button>
              <button className="primary-button" type="submit"><Check size={17} /> حفظ</button>
            </div>
          </form>
        </div>
      )}

      {editingCustomer && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={saveCustomerEdit}>
            <div className="modal-header">
              <div><span className="modal-kicker">تعديل</span><h2>تعديل العميل</h2></div>
              <button type="button" className="icon-button" onClick={() => setEditingCustomer(null)}><X size={19} /></button>
            </div>
            <p className="form-warning">تعديل اسم العميل سيؤدي إلى تحديثه في كل سجلات الحركات الخاصة به.</p>
            <label>الاسم <input name="name" required defaultValue={editingCustomer.name} /></label>
            <label>الهاتف <input name="phone" defaultValue={editingCustomer.phone} /></label>
            <label>المجموعة
              <select name="group" defaultValue={editingCustomer.group}>
                <option>عملاء</option><option>موردين</option><option>شركاء</option><option>أخرى</option>
              </select>
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setEditingCustomer(null)}>إلغاء</button>
              <button className="primary-button" type="submit"><Check size={17} /> حفظ</button>
            </div>
          </form>
        </div>
      )}

      {selectedCustomer && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelectedCustomer(null)}>
          <div className="modal customer-modal">
            <div className="customer-hero">
              <button className="icon-button close-on-card" onClick={() => setSelectedCustomer(null)}><X size={19} /></button>
              <Avatar customer={selectedCustomer} size="lg" />
              <h2>{selectedCustomer.name}</h2>
              <p>{selectedCustomer.phone} • {selectedCustomer.group}</p>
            </div>
            <div className="customer-balance">
              <span>الرصيد الإجمالي</span>
              <strong className={selectedCustomer.balance > 0 ? "debit" : selectedCustomer.balance < 0 ? "credit" : "balanced"}>{selectedCustomer.balance === 0 ? "صفر" : `${selectedCustomer.balance > 0 ? "+" : "-"}${formatMoney(selectedCustomer.balance, overviewCurrency)}`}</strong>
              <small>{selectedCustomer.status}</small>
            </div>
            <div className="customer-actions">
              <button className="primary-button" onClick={() => { setSelectedCustomer(null); setShowTransaction(true); }}><Plus size={17} /> حركة جديدة</button>
              <button className="secondary-button" onClick={() => { if (selectedCustomer.transactionCount) setToast("لا يمكن التعديل لوجود حركات مالية"); else { setEditingCustomer(selectedCustomer); setSelectedCustomer(null); } }}><Pencil size={16} /> تعديل</button>
              <button className="secondary-button" onClick={() => { setReportCustomerId(selectedCustomer.id); setSelectedCustomer(null); handleNav("reports"); }}><FileText size={16} /> كشف</button>
              <button className="icon-button danger-button" onClick={() => removeCustomer(selectedCustomer)}><Trash2 size={17} /></button>
            </div>
          </div>
        </div>
      )}

      {statementCustomer && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setStatementCustomer(null)}>
          <div className="modal statement-modal">
            <div className="modal-header">
              <div><span className="modal-kicker">كشف مختصر</span><h2>{statementCustomer.name}</h2></div>
              <button className="icon-button" onClick={() => setStatementCustomer(null)}><X size={19} /></button>
            </div>
            <div className="statement-summary">
              <span>الرصيد الكلي</span>
              <strong className={statementCustomer.balance > 0 ? "debit" : statementCustomer.balance < 0 ? "credit" : "balanced"}>{statementCustomer.balance === 0 ? "صفر" : `${statementCustomer.balance > 0 ? "+" : "-"}${formatMoney(statementCustomer.balance, overviewCurrency)}`}</strong>
            </div>
            <div className="statement-list">
              {transactions.filter((transaction) => transaction.customer === statementCustomer.name).map((transaction) => (
                <div className="statement-row" key={transaction.id}>
                  <span className={`activity-icon ${transaction.type === "قبض" ? "in" : "out"}`}>{transaction.type === "قبض" ? <ArrowDownLeft size={15} /> : <ArrowUpLeft size={15} />}</span>
                  <div><b>{transaction.note}</b><small>{transaction.type} • {transaction.date}</small></div>
                  <strong className={transaction.type === "قبض" ? "in-text" : "out-text"}>{transaction.type === "قبض" ? "+" : "-"}{formatMoney(transaction.amount, currencyFor(transaction.currencyId))}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast"><span className="toast-check"><Check size={15} /></span>{toast}</div>}
    </div>
  );
}
