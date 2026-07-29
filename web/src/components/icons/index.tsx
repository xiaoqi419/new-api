/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
/* eslint-disable react/only-export-components -- this adapter intentionally
   exports the LucideIcon/IconProps types alongside the icon components */
// Central icon layer. All app UI icons are Phosphor, exposed under the legacy
// lucide export names so call sites and the `LucideIcon` type keep working while
// the underlying set is unified. Brand/model logos (@lobehub, react-icons) are
// intentionally NOT routed through here. Generated map lives in the migration
// plan; edit the mapping there, not by hand.

import {
  ArrowClockwise as P_ArrowClockwise,
  ArrowCounterClockwise as P_ArrowCounterClockwise,
  ArrowDown as P_ArrowDown,
  ArrowDownRight as P_ArrowDownRight,
  ArrowLeft as P_ArrowLeft,
  ArrowLineDown as P_ArrowLineDown,
  ArrowLineUp as P_ArrowLineUp,
  ArrowRight as P_ArrowRight,
  ArrowSquareOut as P_ArrowSquareOut,
  ArrowUp as P_ArrowUp,
  ArrowUpRight as P_ArrowUpRight,
  ArrowsClockwise as P_ArrowsClockwise,
  ArrowsDownUp as P_ArrowsDownUp,
  ArrowsLeftRight as P_ArrowsLeftRight,
  ArrowsOut as P_ArrowsOut,
  Bank as P_Bank,
  Barricade as P_Barricade,
  Bell as P_Bell,
  Binoculars as P_Binoculars,
  BookIcon as P_BookIcon,
  BookOpen as P_BookOpen,
  BracketsCurly as P_BracketsCurly,
  Brain as P_Brain,
  Broadcast as P_Broadcast,
  Buildings as P_Buildings,
  Calendar as P_Calendar,
  CalendarBlank as P_CalendarBlank,
  CalendarDots as P_CalendarDots,
  Camera as P_Camera,
  CaretDoubleLeft as P_CaretDoubleLeft,
  CaretDoubleRight as P_CaretDoubleRight,
  CaretDown as P_CaretDown,
  CaretLeft as P_CaretLeft,
  CaretRight as P_CaretRight,
  CaretUp as P_CaretUp,
  CaretUpDown as P_CaretUpDown,
  ChartBar as P_ChartBar,
  ChartLine as P_ChartLine,
  ChartPie as P_ChartPie,
  ChatCenteredDots as P_ChatCenteredDots,
  ChatCircle as P_ChatCircle,
  ChatCircleDots as P_ChatCircleDots,
  Check as P_Check,
  CheckCircle as P_CheckCircle,
  CheckCircleIcon as P_CheckCircleIcon,
  CheckSquare as P_CheckSquare,
  Circle as P_Circle,
  CircleNotch as P_CircleNotch,
  ClipboardText as P_ClipboardText,
  Clock as P_Clock,
  ClockCounterClockwise as P_ClockCounterClockwise,
  Cloud as P_Cloud,
  Code as P_Code,
  CodeBlock as P_CodeBlock,
  Coins as P_Coins,
  Copy as P_Copy,
  Cpu as P_Cpu,
  CreditCard as P_CreditCard,
  Crown as P_Crown,
  Cube as P_Cube,
  CurrencyDollar as P_CurrencyDollar,
  CursorClick as P_CursorClick,
  Database as P_Database,
  DeviceMobile as P_DeviceMobile,
  DiceFive as P_DiceFive,
  DotIcon as P_DotIcon,
  DotsSixVertical as P_DotsSixVertical,
  DotsThree as P_DotsThree,
  DownloadSimple as P_DownloadSimple,
  Envelope as P_Envelope,
  Eraser as P_Eraser,
  Eye as P_Eye,
  EyeSlash as P_EyeSlash,
  File as P_File,
  FileCode as P_FileCode,
  FileText as P_FileText,
  FileX as P_FileX,
  Flame as P_Flame,
  Flask as P_Flask,
  FloppyDisk as P_FloppyDisk,
  FlowArrow as P_FlowArrow,
  Funnel as P_Funnel,
  Gauge as P_Gauge,
  Gear as P_Gear,
  GearSix as P_GearSix,
  Gift as P_Gift,
  GitBranch as P_GitBranch,
  Globe as P_Globe,
  GraduationCap as P_GraduationCap,
  GridFour as P_GridFour,
  HandCoins as P_HandCoins,
  Handshake as P_Handshake,
  HardDrive as P_HardDrive,
  HardDrives as P_HardDrives,
  Hash as P_Hash,
  Headphones as P_Headphones,
  Heartbeat as P_Heartbeat,
  House as P_House,
  Image as P_Image,
  Images as P_Images,
  Info as P_Info,
  Key as P_Key,
  Laptop as P_Laptop,
  Lifebuoy as P_Lifebuoy,
  Lightbulb as P_Lightbulb,
  Lightning as P_Lightning,
  LinkBreak as P_LinkBreak,
  LinkSimple as P_LinkSimple,
  List as P_List,
  ListChecks as P_ListChecks,
  ListNumbers as P_ListNumbers,
  Lock as P_Lock,
  MagicWand as P_MagicWand,
  MagnifyingGlass as P_MagnifyingGlass,
  Megaphone as P_Megaphone,
  Microphone as P_Microphone,
  Minus as P_Minus,
  Monitor as P_Monitor,
  Moon as P_Moon,
  MoonStars as P_MoonStars,
  MusicNote as P_MusicNote,
  NotePencil as P_NotePencil,
  Package as P_Package,
  Palette as P_Palette,
  PaperPlaneTilt as P_PaperPlaneTilt,
  Paperclip as P_Paperclip,
  Path as P_Path,
  Pause as P_Pause,
  PencilSimple as P_PencilSimple,
  Play as P_Play,
  Plugs as P_Plugs,
  Plus as P_Plus,
  PlusCircle as P_PlusCircle,
  Power as P_Power,
  Presentation as P_Presentation,
  Prohibit as P_Prohibit,
  Pulse as P_Pulse,
  QrCode as P_QrCode,
  Question as P_Question,
  Radio as P_Radio,
  Receipt as P_Receipt,
  Rocket as P_Rocket,
  Scroll as P_Scroll,
  SealCheck as P_SealCheck,
  ShareNetwork as P_ShareNetwork,
  Shield as P_Shield,
  ShieldCheck as P_ShieldCheck,
  ShieldWarning as P_ShieldWarning,
  Shuffle as P_Shuffle,
  SidebarSimple as P_SidebarSimple,
  Sigma as P_Sigma,
  SignIn as P_SignIn,
  SignOut as P_SignOut,
  Sliders as P_Sliders,
  SortAscending as P_SortAscending,
  Sparkle as P_Sparkle,
  Square as P_Square,
  SquaresFour as P_SquaresFour,
  Stack as P_Stack,
  StackPlus as P_StackPlus,
  Sun as P_Sun,
  Swatches as P_Swatches,
  Table as P_Table,
  Tag as P_Tag,
  Terminal as P_Terminal,
  TerminalWindow as P_TerminalWindow,
  TestTube as P_TestTube,
  TextT as P_TextT,
  Ticket as P_Ticket,
  Timer as P_Timer,
  Translate as P_Translate,
  Trash as P_Trash,
  TrendDown as P_TrendDown,
  TrendUp as P_TrendUp,
  Trophy as P_Trophy,
  UploadSimple as P_UploadSimple,
  User as P_User,
  UserGear as P_UserGear,
  Users as P_Users,
  VideoCamera as P_VideoCamera,
  Wallet as P_Wallet,
  Warning as P_Warning,
  WarningCircle as P_WarningCircle,
  Waveform as P_Waveform,
  WifiSlash as P_WifiSlash,
  Wrench as P_Wrench,
  X as P_X,
  XCircle as P_XCircle,
  type IconProps as PhIconProps,
  type IconWeight,
} from '@phosphor-icons/react'
import type { ComponentType, SVGProps } from 'react'

export type IconProps = SVGProps<SVGSVGElement> & { size?: number | string }
export type LucideIcon = ComponentType<IconProps>

function weightFromStroke(
  sw: IconProps['strokeWidth']
): IconWeight | undefined {
  if (sw == null) return undefined
  const n = typeof sw === 'string' ? Number.parseFloat(sw) : sw
  if (Number.isNaN(n)) return undefined
  if (n <= 1.5) return 'light'
  if (n >= 2.5) return 'bold'
  return 'regular'
}

function ic(Phosphor: ComponentType<PhIconProps>): LucideIcon {
  return function Icon({ strokeWidth, ...rest }: IconProps) {
    return <Phosphor weight={weightFromStroke(strokeWidth)} {...rest} />
  }
}

export const Activity = ic(P_Pulse)
export const AlertCircle = ic(P_WarningCircle)
export const AlertTriangle = ic(P_Warning)
export const AreaChart = ic(P_ChartLine)
export const ArrowDown = ic(P_ArrowDown)
export const ArrowDownIcon = ic(P_ArrowDown)
export const ArrowDownRight = ic(P_ArrowDownRight)
export const ArrowDownToLine = ic(P_ArrowLineDown)
export const ArrowLeft = ic(P_ArrowLeft)
export const ArrowLeftIcon = ic(P_ArrowLeft)
export const ArrowRight = ic(P_ArrowRight)
export const ArrowRightIcon = ic(P_ArrowRight)
export const ArrowRightLeft = ic(P_ArrowsLeftRight)
export const ArrowUp = ic(P_ArrowUp)
export const ArrowUpDown = ic(P_ArrowsDownUp)
export const ArrowUpFromLine = ic(P_ArrowLineUp)
export const ArrowUpRight = ic(P_ArrowUpRight)
export const AudioLines = ic(P_Waveform)
export const BadgeCheck = ic(P_SealCheck)
export const Ban = ic(P_Prohibit)
export const BarChart3 = ic(P_ChartBar)
export const BarChartIcon = ic(P_ChartBar)
export const Bell = ic(P_Bell)
export const BookIcon = ic(P_BookIcon)
export const BookOpen = ic(P_BookOpen)
export const Box = ic(P_Cube)
export const Boxes = ic(P_Stack)
export const Braces = ic(P_BracketsCurly)
export const BrainIcon = ic(P_Brain)
export const Building2 = ic(P_Buildings)
export const Calendar = ic(P_Calendar)
export const CalendarClock = ic(P_CalendarBlank)
export const CalendarDays = ic(P_CalendarDots)
export const CameraIcon = ic(P_Camera)
export const Check = ic(P_Check)
export const CheckCircle2 = ic(P_CheckCircle)
export const CheckCircleIcon = ic(P_CheckCircleIcon)
export const CheckIcon = ic(P_Check)
export const CheckSquare = ic(P_CheckSquare)
export const ChevronDown = ic(P_CaretDown)
export const ChevronDownIcon = ic(P_CaretDown)
export const ChevronLeft = ic(P_CaretLeft)
export const ChevronLeftIcon = ic(P_CaretLeft)
export const ChevronRight = ic(P_CaretRight)
export const ChevronRightIcon = ic(P_CaretRight)
export const ChevronUp = ic(P_CaretUp)
export const ChevronsLeft = ic(P_CaretDoubleLeft)
export const ChevronsRight = ic(P_CaretDoubleRight)
export const ChevronsUpDown = ic(P_CaretUpDown)
export const ChevronsUpDownIcon = ic(P_CaretUpDown)
export const Circle = ic(P_Circle)
export const CircleAlert = ic(P_WarningCircle)
export const CircleCheck = ic(P_CheckCircle)
export const CircleHelp = ic(P_Question)
export const CircleIcon = ic(P_Circle)
export const CircleQuestionMark = ic(P_Question)
export const CircleX = ic(P_XCircle)
export const ClipboardPaste = ic(P_ClipboardText)
export const Clock = ic(P_Clock)
export const ClockIcon = ic(P_Clock)
export const Cloud = ic(P_Cloud)
export const Code = ic(P_Code)
export const Code2 = ic(P_Code)
export const CodeSquareIcon = ic(P_CodeBlock)
export const Coins = ic(P_Coins)
export const Construction = ic(P_Barricade)
export const Copy = ic(P_Copy)
export const CopyIcon = ic(P_Copy)
export const CpuIcon = ic(P_Cpu)
export const CreditCard = ic(P_CreditCard)
export const Crown = ic(P_Crown)
export const Database = ic(P_Database)
export const Dices = ic(P_DiceFive)
export const DollarSign = ic(P_CurrencyDollar)
export const DotIcon = ic(P_DotIcon)
export const Download = ic(P_DownloadSimple)
export const DownloadIcon = ic(P_DownloadSimple)
export const Edit = ic(P_PencilSimple)
export const Eraser = ic(P_Eraser)
export const ExternalLink = ic(P_ArrowSquareOut)
export const ExternalLinkIcon = ic(P_ArrowSquareOut)
export const Eye = ic(P_Eye)
export const EyeOff = ic(P_EyeSlash)
export const FileCode2 = ic(P_FileCode)
export const FileIcon = ic(P_File)
export const FileText = ic(P_FileText)
export const FileWarning = ic(P_FileX)
export const Filter = ic(P_Funnel)
export const Flame = ic(P_Flame)
export const FlaskConical = ic(P_Flask)
export const Gauge = ic(P_Gauge)
export const Gift = ic(P_Gift)
export const GitBranch = ic(P_GitBranch)
export const Globe = ic(P_Globe)
export const GlobeIcon = ic(P_Globe)
export const GraduationCapIcon = ic(P_GraduationCap)
export const Grid2X2 = ic(P_GridFour)
export const GripVertical = ic(P_DotsSixVertical)
export const HandCoins = ic(P_HandCoins)
export const Handshake = ic(P_Handshake)
export const HardDrive = ic(P_HardDrive)
export const Hash = ic(P_Hash)
export const Headphones = ic(P_Headphones)
export const HeartHandshake = ic(P_Handshake)
export const HeartPulse = ic(P_Heartbeat)
export const HelpCircle = ic(P_Question)
export const History = ic(P_ClockCounterClockwise)
export const Home = ic(P_House)
export const Image = ic(P_Image)
export const ImageIcon = ic(P_Image)
export const Images = ic(P_Images)
export const Info = ic(P_Info)
export const Key = ic(P_Key)
export const KeyRound = ic(P_Key)
export const Landmark = ic(P_Bank)
export const Languages = ic(P_Translate)
export const Laptop = ic(P_Laptop)
export const Layers = ic(P_Stack)
export const Layers3 = ic(P_StackPlus)
export const LayersIcon = ic(P_Stack)
export const Layout = ic(P_SidebarSimple)
export const LayoutDashboard = ic(P_SquaresFour)
export const LifeBuoy = ic(P_Lifebuoy)
export const Lightbulb = ic(P_Lightbulb)
export const Link = ic(P_LinkSimple)
export const Link2 = ic(P_LinkSimple)
export const List = ic(P_List)
export const ListChecks = ic(P_ListChecks)
export const ListOrdered = ic(P_ListNumbers)
export const Loader = ic(P_CircleNotch)
export const Loader2 = ic(P_CircleNotch)
export const Loader2Icon = ic(P_CircleNotch)
export const Lock = ic(P_Lock)
export const LogIn = ic(P_SignIn)
export const LogOut = ic(P_SignOut)
export const Mail = ic(P_Envelope)
export const Maximize2 = ic(P_ArrowsOut)
export const Megaphone = ic(P_Megaphone)
export const Menu = ic(P_List)
export const MessageCircle = ic(P_ChatCircle)
export const MessageCircleIcon = ic(P_ChatCircle)
export const MessageCircleWarning = ic(P_ChatCircleDots)
export const MessageSquarePlusIcon = ic(P_ChatCenteredDots)
export const MicIcon = ic(P_Microphone)
export const Minus = ic(P_Minus)
export const Monitor = ic(P_Monitor)
export const Moon = ic(P_Moon)
export const MoonStar = ic(P_MoonStars)
export const MoreHorizontal = ic(P_DotsThree)
export const MousePointerClick = ic(P_CursorClick)
export const Music = ic(P_MusicNote)
export const NotepadTextIcon = ic(P_NotePencil)
export const Package = ic(P_Package)
export const Palette = ic(P_Palette)
export const Paperclip = ic(P_Paperclip)
export const PaperclipIcon = ic(P_Paperclip)
export const Pause = ic(P_Pause)
export const Pencil = ic(P_PencilSimple)
export const PieChart = ic(P_ChartPie)
export const Play = ic(P_Play)
export const PlugZap = ic(P_Plugs)
export const Plus = ic(P_Plus)
export const PlusCircle = ic(P_PlusCircle)
export const PlusIcon = ic(P_Plus)
export const Power = ic(P_Power)
export const PowerOff = ic(P_Power)
export const Presentation = ic(P_Presentation)
export const QrCode = ic(P_QrCode)
export const Radio = ic(P_Radio)
export const Receipt = ic(P_Receipt)
export const ReceiptText = ic(P_Receipt)
export const RefreshCcw = ic(P_ArrowsClockwise)
export const RefreshCcwIcon = ic(P_ArrowsClockwise)
export const RefreshCw = ic(P_ArrowsClockwise)
export const Rocket = ic(P_Rocket)
export const RotateCcw = ic(P_ArrowCounterClockwise)
export const RotateCw = ic(P_ArrowClockwise)
export const Route = ic(P_Path)
export const Save = ic(P_FloppyDisk)
export const ScreenShareIcon = ic(P_Broadcast)
export const ScrollText = ic(P_Scroll)
export const Search = ic(P_MagnifyingGlass)
export const SearchIcon = ic(P_MagnifyingGlass)
export const Send = ic(P_PaperPlaneTilt)
export const SendIcon = ic(P_PaperPlaneTilt)
export const Server = ic(P_HardDrives)
export const ServerCog = ic(P_HardDrives)
export const Settings = ic(P_Gear)
export const Settings2 = ic(P_GearSix)
export const Share2 = ic(P_ShareNetwork)
export const Shield = ic(P_Shield)
export const ShieldAlert = ic(P_ShieldWarning)
export const ShieldCheck = ic(P_ShieldCheck)
export const Shuffle = ic(P_Shuffle)
export const Sigma = ic(P_Sigma)
export const SlidersHorizontal = ic(P_Sliders)
export const SlidersHorizontalIcon = ic(P_Sliders)
export const Smartphone = ic(P_DeviceMobile)
export const SortAsc = ic(P_SortAscending)
export const Sparkles = ic(P_Sparkle)
export const SquareIcon = ic(P_Square)
export const Sun = ic(P_Sun)
export const SwatchBook = ic(P_Swatches)
export const Table = ic(P_Table)
export const Table2 = ic(P_Table)
export const Tag = ic(P_Tag)
export const Tags = ic(P_Tag)
export const Telescope = ic(P_Binoculars)
export const Terminal = ic(P_Terminal)
export const TerminalSquare = ic(P_TerminalWindow)
export const TestTube = ic(P_TestTube)
export const Ticket = ic(P_Ticket)
export const Timer = ic(P_Timer)
export const Trash2 = ic(P_Trash)
export const Trash2Icon = ic(P_Trash)
export const TrendingDown = ic(P_TrendDown)
export const TrendingUp = ic(P_TrendUp)
export const TriangleAlert = ic(P_Warning)
export const Trophy = ic(P_Trophy)
export const Type = ic(P_TextT)
export const Unlink = ic(P_LinkBreak)
export const Upload = ic(P_UploadSimple)
export const User = ic(P_User)
export const UserCog = ic(P_UserGear)
export const UserRound = ic(P_User)
export const Users = ic(P_Users)
export const Video = ic(P_VideoCamera)
export const Wallet = ic(P_Wallet)
export const WalletCards = ic(P_Wallet)
export const Wand2 = ic(P_MagicWand)
export const WandSparkles = ic(P_MagicWand)
export const Webhook = ic(P_FlowArrow)
export const WifiOff = ic(P_WifiSlash)
export const Wrench = ic(P_Wrench)
export const WrenchIcon = ic(P_Wrench)
export const X = ic(P_X)
export const XCircle = ic(P_XCircle)
export const XCircleIcon = ic(P_XCircle)
export const XIcon = ic(P_X)
export const Zap = ic(P_Lightning)
