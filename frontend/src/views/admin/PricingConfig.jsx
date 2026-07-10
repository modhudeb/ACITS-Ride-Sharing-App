import { useEffect, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Switcher from '@/components/ui/Switcher'
import { FormItem, Form } from '@/components/ui/Form'
import NumericInput from '@/components/shared/NumericInput'
import Notification from '@/components/ui/Notification'
import toast from '@/components/ui/toast'
import Loading from '@/components/shared/Loading'
import { apiGetPricing, apiUpdatePricing } from '@/services/AdminService'

const notify = (title, type) => {
    toast.push(<Notification title={title} type={type} />, {
        placement: 'top-center',
    })
}

const fields = [
    { name: 'base_fare', label: 'Base fare (BDT)' },
    { name: 'per_km_rate', label: 'Per kilometer rate (BDT)' },
    { name: 'per_min_rate', label: 'Per minute rate (BDT)' },
    { name: 'booking_fee', label: 'Booking fee (BDT, never surged)' },
    { name: 'minimum_fare', label: 'Minimum fare (BDT)' },
    { name: 'per_kg_rate', label: 'Goods rate per kg (BDT)' },
    { name: 'per_m3_rate', label: 'Goods rate per m³ (BDT)' },
    { name: 'pool_discount_pct', label: 'Shared-truck discount (%)' },
    { name: 'peak_hour_multiplier', label: 'Peak hour multiplier' },
    { name: 'night_multiplier', label: 'Night multiplier' },
    { name: 'surge_cap', label: 'Surge cap (max multiplier)' },
    { name: 'cancellation_fee', label: 'Cancellation fee (BDT)' },
    {
        name: 'cancellation_free_window_sec',
        label: 'Free cancellation window (seconds)',
    },
]

const PricingConfig = () => {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const { control, handleSubmit, reset } = useForm()

    useEffect(() => {
        apiGetPricing()
            .then((data) => reset(data))
            .catch(() => notify('Failed to load pricing config', 'danger'))
            .finally(() => setLoading(false))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const onSubmit = async (values) => {
        setSaving(true)
        try {
            await apiUpdatePricing(values)
            notify('Pricing updated', 'success')
        } catch {
            notify('Failed to update pricing', 'danger')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="max-w-xl">
            <h3 className="mb-4">Pricing Config</h3>
            <Loading loading={loading}>
                <Card>
                    <Form onSubmit={handleSubmit(onSubmit)}>
                        {fields.map(({ name, label }) => (
                            <FormItem key={name} label={label}>
                                <Controller
                                    name={name}
                                    control={control}
                                    render={({ field }) => (
                                        <NumericInput
                                            value={field.value}
                                            onValueChange={({ floatValue }) =>
                                                field.onChange(floatValue ?? 0)
                                            }
                                        />
                                    )}
                                />
                            </FormItem>
                        ))}
                        <FormItem label="Enable surge pricing">
                            <Controller
                                name="surge_enabled"
                                control={control}
                                render={({ field }) => (
                                    <Switcher
                                        checked={field.value}
                                        onChange={(checked) =>
                                            field.onChange(checked)
                                        }
                                    />
                                )}
                            />
                        </FormItem>
                        <Button variant="solid" type="submit" loading={saving}>
                            Save changes
                        </Button>
                    </Form>
                </Card>
            </Loading>
        </div>
    )
}

export default PricingConfig
