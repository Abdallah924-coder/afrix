import mongoose from "mongoose";

const flexibleOptions = { timestamps: true, minimize: false, strict: false };

export { mongoose };

export const UserModel = mongoose.models.User || mongoose.model("User", new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true, index: true }
}, flexibleOptions));

export const TransactionModel = mongoose.models.Transaction || mongoose.model("Transaction", new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  status: { type: String, index: true },
  createdAt: { type: String, index: true }
}, flexibleOptions));

export const CicoRequestModel = mongoose.models.CicoRequest || mongoose.model("CicoRequest", new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  reference: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  merchantId: { type: String, index: true },
  status: { type: String, index: true },
  createdAt: { type: String, index: true }
}, flexibleOptions));

export const MerchantApplicationModel = mongoose.models.MerchantApplication || mongoose.model("MerchantApplication", new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  status: { type: String, index: true },
  createdAt: { type: String, index: true }
}, flexibleOptions));

export const DisputeModel = mongoose.models.Dispute || mongoose.model("Dispute", new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  reference: { type: String, index: true },
  status: { type: String, index: true },
  createdAt: { type: String, index: true }
}, flexibleOptions));

export const LedgerEntryModel = mongoose.models.LedgerEntry || mongoose.model("LedgerEntry", new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  groupId: { type: String, required: true, index: true },
  accountType: { type: String, required: true, index: true },
  accountId: { type: String, required: true, index: true },
  direction: { type: String, required: true },
  amount: { type: Number, required: true },
  createdAt: { type: String, index: true }
}, flexibleOptions));

export const SettingModel = mongoose.models.Setting || mongoose.model("Setting", new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true, minimize: false }));

export const PlatformAccountModel = mongoose.models.PlatformAccount || mongoose.model("PlatformAccount", new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  balance: { type: Number, default: 0 },
  fees: { type: Number, default: 0 }
}, flexibleOptions));
