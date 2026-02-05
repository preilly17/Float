import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Calendar, Plus, Menu, Users, Clock, Home, Package, DollarSign, MapPin, Lightbulb } from "lucide-react";
import { Link } from "wouter";
import { NotificationIcon } from "./notification-icon";
import type { TripWithDetails, User } from "@shared/schema";

interface MobileNavProps {
  trip: TripWithDetails;
  user?: User;
}

export function MobileNav({ trip, user }: MobileNavProps) {
  // MOBILE-ONLY top navigation shell
  return (
    <nav className="md:hidden trip-themed-nav border-b border-white/20 px-4 py-3 sticky top-0 z-50">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Sheet>
            <SheetTrigger asChild>
              {/* // MOBILE-ONLY enlarged tap target */}
              <Button variant="ghost" size="icon" className="h-11 w-11 rounded-full">
                <Menu className="w-5 h-5 text-white" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 bg-slate-900/95 backdrop-blur-xl border-r border-white/10">
              <div className="flex flex-col h-full">
                {/* Logo */}
                <div className="flex items-center px-6 py-4 border-b border-white/10">
                  <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-violet-500 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
                    <Calendar className="text-white w-5 h-5" />
                  </div>
                  <span className="ml-3 text-xl font-semibold text-white">Float</span>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-4 py-6 space-y-2">
                  <Link href="/" className="flex items-center px-3 py-2.5 text-sm font-medium text-slate-300 hover:text-white hover:bg-gradient-to-r hover:from-white/10 hover:to-white/5 rounded-xl transition-all duration-200">
                    <Home className="w-4 h-4 mr-3" />
                    All Trips
                  </Link>
                  <Link href="/how-it-works" className="flex items-center px-3 py-2.5 text-sm font-medium text-slate-300 hover:text-white hover:bg-gradient-to-r hover:from-white/10 hover:to-white/5 rounded-xl transition-all duration-200">
                    <Lightbulb className="w-4 h-4 mr-3" />
                    How it works
                  </Link>
                  <Link href={`/trip/${trip.id}`} className="flex items-center px-3 py-2.5 text-sm font-medium text-slate-300 hover:text-white hover:bg-gradient-to-r hover:from-white/10 hover:to-white/5 rounded-xl transition-all duration-200">
                    <Calendar className="w-4 h-4 mr-3" />
                    Trip Calendar
                  </Link>
                  <Link href={`/trip/${trip.id}/members`} className="flex items-center px-3 py-2.5 text-sm font-medium text-slate-300 hover:text-white hover:bg-gradient-to-r hover:from-white/10 hover:to-white/5 rounded-xl transition-all duration-200">
                    <Users className="w-4 h-4 mr-3" />
                    Member Schedules
                  </Link>
                  <Link href={`/trip/${trip.id}/activities`} className="flex items-center px-3 py-2.5 text-sm font-medium text-slate-300 hover:text-white hover:bg-gradient-to-r hover:from-white/10 hover:to-white/5 rounded-xl transition-all duration-200">
                    <MapPin className="w-4 h-4 mr-3" />
                    Activities
                  </Link>
                </nav>

                {/* User Profile */}
                <div className="px-4 py-4 border-t border-white/10">
                  <div className="flex items-center">
                    <Avatar className="w-10 h-10 ring-2 ring-cyan-400/30">
                      <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.firstName || 'User'} />
                      <AvatarFallback className="bg-gradient-to-br from-cyan-500/20 to-violet-500/20 text-white">
                        {(user?.firstName?.[0] || user?.email?.[0] || 'U').toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-white">
                        {user?.firstName && user?.lastName 
                          ? `${user.firstName} ${user.lastName}`
                          : user?.firstName || user?.email || 'User'
                        }
                      </p>
                      <p className="text-xs text-slate-400">{user?.email}</p>
                    </div>
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/15 border border-white/25">
            <Calendar className="text-white w-4 h-4" />
          </div>
          <span className="text-lg font-semibold text-white drop-shadow-sm">Float</span>
        </div>
        <div className="flex items-center space-x-3">
          <NotificationIcon />
          <Avatar className="w-8 h-8 ring-2 ring-white/20">
            <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.firstName || 'User'} />
            <AvatarFallback className="text-xs bg-white/15 text-white">
              {(user?.firstName?.[0] || user?.email?.[0] || 'U').toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </nav>
  );
}
