import { useEffect, useState } from "react"
import floatLogo from "@/assets/float-logo.png"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { CalendarCheck, ClipboardList, Crown, Sparkles, Vote } from "lucide-react"

const howItWorks = [
  {
    title: "Float ideas",
    description: "Drop options into one shared board so everyone can see the same plan in real time.",
    icon: Sparkles,
  },
  {
    title: "Vote & decide",
    description: "Quick polls help your group choose the best option without endless back-and-forth.",
    icon: Vote,
  },
  {
    title: "Sync to calendar",
    description: "Confirmed plans sync to calendars so nobody misses the moments that matter.",
    icon: CalendarCheck,
  },
]

const benefits = [
  {
    title: "Shared itinerary",
    description: "Keep flights, stays, meals, and activities in one clear timeline.",
    icon: ClipboardList,
  },
  {
    title: "Fast decisions",
    description: "Turn group opinions into clear choices in minutes, not days.",
    icon: Vote,
  },
  {
    title: "Calendar sync",
    description: "Push confirmed events to calendars so everyone stays aligned.",
    icon: CalendarCheck,
  },
  {
    title: "Owner control",
    description: "Trip owners keep structure while collaborators can still contribute.",
    icon: Crown,
  },
]

const testimonials = [
  {
    quote: "Float made our reunion trip feel effortless—everyone knew the plan and actually showed up on time.",
    name: "Maya R.",
  },
  {
    quote: "We stopped debating in chat and started voting in Float. Decisions became instant.",
    name: "Jordan P.",
  },
  {
    quote: "The shared itinerary gave our whole group confidence. No more confusion, no more duplicate plans.",
    name: "Elena T.",
  },
]

const baseCardClass =
  "rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-cyan-50/40 to-violet-50/40 shadow-sm"

export default function Landing() {
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener("scroll", onScroll)
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <nav
        className={`sticky top-0 z-30 border-b transition-all duration-300 ${
          isScrolled
            ? "border-slate-200/90 bg-white/92 backdrop-blur-xl"
            : "border-slate-200/60 bg-white/82 backdrop-blur-md"
        }`}
      >
        <div className="mx-auto flex h-24 w-full max-w-6xl items-center justify-between px-4 lg:px-8">
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center gap-3"
            aria-label="Float home"
          >
            <img src={floatLogo} alt="Float" className="h-14 w-auto" />
            <span className="text-3xl font-bold tracking-tight text-slate-900">Float</span>
          </button>

          <div className="hidden flex-1 justify-center md:flex">
            <div className="flex items-center gap-8 text-sm font-semibold text-slate-600">
              <button
                onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
                className="transition hover:text-slate-900"
              >
                Features
              </button>
              <button
                onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
                className="transition hover:text-slate-900"
              >
                How it works
              </button>
              <button
                onClick={() => document.getElementById("stories")?.scrollIntoView({ behavior: "smooth" })}
                className="transition hover:text-slate-900"
              >
                Stories
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="hidden rounded-full border-slate-300 bg-white text-slate-700 hover:bg-slate-50 sm:inline-flex"
              onClick={() => (window.location.href = "/login")}
            >
              Log in
            </Button>
            <Button
              onClick={() => (window.location.href = "/register")}
              className="rounded-full bg-gradient-to-r from-teal-500 to-violet-500 px-5 text-white"
            >
              Get started
            </Button>
          </div>
        </div>
      </nav>

      <main>
        <section
          className="relative overflow-hidden bg-cover bg-center"
          style={{ backgroundImage: "url('/landing/beach-hero.svg')" }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white via-white/92 via-[62%] to-white/20" />
          <div className="relative mx-auto grid w-full max-w-6xl gap-8 px-4 pb-14 pt-14 md:min-h-[580px] lg:grid-cols-[1.05fr,0.95fr] lg:items-center lg:px-8 lg:pb-16 lg:pt-16">
            <div>
              <p className="inline-flex rounded-full border border-cyan-100 bg-white/95 px-4 py-1 text-sm font-medium text-cyan-800">
                Group travel made simple
              </p>
              <h1 className="mt-6 max-w-2xl text-4xl font-bold leading-tight text-slate-900 sm:text-5xl">
                Plan trips together—without the chaos.
              </h1>
              <p className="mt-5 max-w-xl text-lg text-slate-700">
                Float keeps plans, RSVPs, and decisions in one shared itinerary everyone can trust.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button
                  onClick={() => (window.location.href = "/register")}
                  className="rounded-full bg-gradient-to-r from-teal-500 to-violet-500 px-6 text-white"
                >
                  Start a trip
                </Button>
                <Button
                  variant="outline"
                  className="rounded-full border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
                >
                  See how it works
                </Button>
              </div>
            </div>

            <Card className={`${baseCardClass} p-2`}>
              <CardContent className="space-y-4 rounded-2xl bg-white/95 p-5">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">Thursday · 1:30 PM</p>
                  <p className="mt-2 text-base font-semibold text-slate-900">Kayak along the coast</p>
                  <p className="mt-1 text-sm text-slate-600">6 going · 2 maybe · calendar synced</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-700">Friday · 9:00 AM</p>
                  <p className="mt-2 text-base font-semibold text-slate-900">Local breakfast meetup</p>
                  <p className="mt-1 text-sm text-slate-600">RSVPs finalized · reminder set</p>
                </div>
                <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-4 text-sm text-slate-700">
                  Product preview: one clean, shared itinerary view for the whole group.
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section id="how-it-works" className="bg-gradient-to-b from-cyan-50/70 to-white">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 lg:px-8 lg:py-14">
            <h2 className="text-3xl font-bold text-slate-900">How it works</h2>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {howItWorks.map(({ title, description, icon: Icon }) => (
                <Card key={title} className={baseCardClass}>
                  <CardContent className="p-6">
                    <div className="mb-4 inline-flex rounded-xl border border-cyan-200 bg-cyan-100 p-3 text-cyan-800">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="bg-gradient-to-b from-white to-violet-50/60">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 lg:px-8 lg:py-14">
            <h2 className="text-3xl font-bold text-slate-900">Why groups choose Float</h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {benefits.map(({ title, description, icon: Icon }) => (
                <Card key={title} className={baseCardClass}>
                  <CardContent className="p-6">
                    <div className="mb-4 inline-flex rounded-xl border border-violet-200 bg-violet-100 p-3 text-violet-800">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section id="stories" className="bg-gradient-to-b from-cyan-50/60 to-white">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 lg:px-8 lg:py-14">
            <h2 className="text-3xl font-bold text-slate-900">What travelers say</h2>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {testimonials.map((item) => (
                <Card key={item.name} className={baseCardClass}>
                  <CardContent className="p-6">
                    <p className="text-[15px] leading-relaxed text-slate-700">“{item.quote}”</p>
                    <p className="mt-4 text-sm font-semibold text-slate-500">{item.name}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-gradient-to-b from-white to-violet-50/70">
          <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-8 lg:px-8">
            <div className="rounded-[28px] border border-slate-200 bg-gradient-to-r from-cyan-50 via-white to-violet-50 px-6 py-12 text-center shadow-sm">
              <h2 className="text-3xl font-bold text-slate-900">Ready to plan your next group trip?</h2>
              <Button
                onClick={() => (window.location.href = "/register")}
                className="mt-6 rounded-full bg-gradient-to-r from-teal-500 to-violet-500 px-8 text-white"
              >
                Get started
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
